#!/bin/bash
# Get the public IP of the running ECS task

CLUSTER_NAME="citizen-science-cluster"
SERVICE_NAME="citizen-science-service"
REGION="us-east-1"

echo "Getting public IP for ECS task..."

# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster $CLUSTER_NAME \
  --service-name $SERVICE_NAME \
  --region $REGION \
  --query "taskArns[0]" \
  --output text)

if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" == "None" ]; then
  echo "❌ No running tasks found. Is the service running?"
  exit 1
fi

echo "Task ARN: $TASK_ARN"

# Get network interface ID
NETWORK_INTERFACE_ID=$(aws ecs describe-tasks \
  --cluster $CLUSTER_NAME \
  --tasks $TASK_ARN \
  --region $REGION \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" \
  --output text)

if [ -z "$NETWORK_INTERFACE_ID" ]; then
  echo "❌ Could not find network interface"
  exit 1
fi

# Get public IP
PUBLIC_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids $NETWORK_INTERFACE_ID \
  --region $REGION \
  --query "NetworkInterfaces[0].Association.PublicIp" \
  --output text)

if [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" == "None" ]; then
  echo "❌ No public IP found. Task may still be starting..."
  exit 1
fi

echo ""
echo "✅ Public IP: $PUBLIC_IP"
echo "🌐 Access your site at: http://$PUBLIC_IP:3000"
echo ""

