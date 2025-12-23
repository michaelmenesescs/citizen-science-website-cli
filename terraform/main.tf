terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Data sources for existing resources
data "aws_caller_identity" "current" {}
data "aws_vpc" "default" {
  default = true
}
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
data "aws_acm_certificate" "domain" {
  domain   = "citizensciencemusic.com"
  statuses = ["ISSUED"]
}
data "aws_route53_zone" "domain" {
  name = "citizensciencemusic.com"
}

# ECR Repository
resource "aws_ecr_repository" "app" {
  name                 = "citizen-science-website"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "citizen-science-website"
    Environment = "production"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/citizen-science-task"
  retention_in_days = 7

  tags = {
    Name = "citizen-science-ecs-logs"
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_execution" {
  name = "ecsTaskExecutionRole-citizen-science"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "ecs-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Role for ECS Task (minimal permissions)
resource "aws_iam_role" "ecs_task" {
  name = "ecsTaskRole-citizen-science"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "ecs-task-role"
  }
}

# Security Group for NLB (allows traffic from CloudFront)
resource "aws_security_group" "nlb" {
  name        = "citizen-science-nlb-sg"
  description = "Security group for Citizen Science NLB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP from CloudFront/Internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "citizen-science-nlb-sg"
  }
}

# Security Group for ECS Tasks (allow HTTP from NLB only)
resource "aws_security_group" "ecs" {
  name        = "citizen-science-ecs-sg"
  description = "Security group for Citizen Science ECS tasks"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "HTTP from NLB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.nlb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "citizen-science-ecs-sg"
  }
}

# Network Load Balancer (much cheaper than ALB: ~$3-4/month vs $16/month)
resource "aws_lb" "nlb" {
  name               = "citizen-science-nlb"
  internal           = false
  load_balancer_type = "network"
  subnets            = data.aws_subnets.default.ids

  enable_deletion_protection = false

  tags = {
    Name = "citizen-science-nlb"
  }
}

# Target Group for NLB
resource "aws_lb_target_group" "app" {
  name        = "citizen-science-tg"
  port        = 3000
  protocol    = "TCP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 10
    interval            = 30
    protocol            = "TCP"
  }

  tags = {
    Name = "citizen-science-tg"
  }
}

# NLB Listener
resource "aws_lb_listener" "nlb" {
  load_balancer_arn = aws_lb.nlb.arn
  port              = "80"
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "app" {
  name = "citizen-science-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Name = "citizen-science-cluster"
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "app" {
  family                   = "citizen-science-task"
  network_mode             = "awsvpc"
  requires_compatibilities  = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn      = aws_iam_role.ecs_execution.arn
  task_role_arn           = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "${aws_ecr_repository.app.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix"  = "ecs"
        }
      }

      # Health check configuration
      # IMPORTANT: wget must be installed in Dockerfile (see Dockerfile line 29)
      # Uses full path /usr/bin/wget to ensure it's found when running as nextjs user
      # startPeriod of 90s gives Next.js time to fully start before health checks begin
      healthCheck = {
        command     = ["CMD-SHELL", "/usr/bin/wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1"]
        interval    = 30  # Check every 30 seconds
        timeout     = 10  # 10 second timeout per check
        retries     = 3   # Retry 3 times before marking unhealthy
        startPeriod = 90  # 90 second grace period before health checks start
      }
    }
  ])

  tags = {
    Name = "citizen-science-task"
  }
}

# ECS Service
resource "aws_ecs_service" "app" {
  name            = "citizen-science-service"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false  # No public IP needed, NLB handles routing
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [
    aws_lb_listener.nlb
  ]

  tags = {
    Name = "citizen-science-service"
  }
}

