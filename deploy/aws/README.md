# Open Design AWS Deployment

This directory contains an AWS CloudFormation template (`template.yaml`) to deploy Open Design into your AWS environment using Amazon Elastic Container Service (ECS) with AWS Fargate.

## Architecture Overview

The template provisions a robust, fault-tolerant, and secure architecture for Open Design:

*   **Networking:** A new Virtual Private Cloud (VPC) spanning two Availability Zones, with both Public and Private subnets. Two independent NAT Gateways (one in each AZ) provide highly available outbound internet access.
*   **Load Balancing:** An internet-facing Application Load Balancer (ALB) routes incoming traffic. It optionally supports HTTPS if a custom domain and ACM certificate are provided.
*   **Compute:** AWS ECS running on serverless Fargate instances in the private subnets. To protect the file-based SQLite database from concurrent network write corruption, the service hard-codes a single-instance baseline (DesiredCount: 1). However, it leverages the multi-AZ networking primitives for Active-Passive fault tolerance: if a task or zone fails, ECS automatically reschedules the container in the healthy AZ. The task definition includes:
    *   The **Open Design** app container.
    *   An **Nginx Auth Proxy** sidecar container that securely attaches the Open Design API Token to incoming `/api/` requests.
*   **Storage:** Amazon Elastic File System (EFS) is mounted to the Fargate containers for persistent daemon storage. Before documenting or changing the mount, you MUST read root [`AGENTS.md`](../../AGENTS.md) → **Daemon data directory contract**. This README MUST NOT restate it. EFS is configured with deletion protection (`Retain`) to prevent accidental data loss.
*   **Security:**
    *   **Secrets Manager:** Securely stores the Open Design API Token, preventing it from being exposed in plain text.
    *   **Security Groups:** Restrict traffic flow. The ALB requires an explicitly configured CIDR — ensure this is your VPN or corporate range to avoid unintended public exposure. Fargate only accepts traffic from the ALB; EFS only accepts traffic from Fargate.
*   **Logging:** Amazon CloudWatch Log Group captures container logs for easy debugging.

## Prerequisites

*   An AWS Account.
*   [AWS CLI](https://aws.amazon.com/cli/) installed and configured with appropriate permissions.
*   (Optional) An ACM Certificate ARN if you want to use a custom domain with HTTPS.

## Parameters

When deploying the CloudFormation stack, you can customize the following parameters:

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `AllowedSourceIp` | **(Required)** The specific IPv4 CIDR block allowlisted to access the Load Balancer. The ALB requires an explicitly configured CIDR — ensure this is your VPN or corporate range to avoid unintended public exposure. Accepts any valid IPv4 range with a subnet mask between /16 and /32. | *None* |
| `ApiToken` | **(Required)** The secure API token used to authenticate requests to the Open Design backend. It is stored securely in AWS Secrets Manager. |  |
| `DockerImage` | **(Required)** The full repository URI and tag for the Open Design Docker image. You must provide an explicit image as the public Docker Hub baseline is currently unmaintained. | *None* |
| `VpcCidr` | The CIDR block for the VPC. | `10.42.0.0/16` |
| `PublicSubnet1Cidr` | The CIDR block for Public Subnet 1 (AZ1). | `10.42.1.0/24` |
| `PublicSubnet2Cidr` | The CIDR block for Public Subnet 2 (AZ2). | `10.42.3.0/24` |
| `PrivateSubnet1Cidr` | The CIDR block for Private Subnet 1 (AZ1). | `10.42.2.0/24` |
| `PrivateSubnet2Cidr` | The CIDR block for Private Subnet 2 (AZ2). | `10.42.4.0/24` |
| `TaskSize` | The compute size for the Open Design application. Allowed values: `small` (256 CPU, 1024 MiB), `medium` (512 CPU, 2048 MiB), `large` (1024 CPU, 4096 MiB). | `small` |
| `TaskCpuArchitecture` | The CPU architecture for the ECS task. Must match the architecture of your Docker image. Allowed values (available as a dropdown): `X86_64`, `ARM64`. | `X86_64` |
| `CustomDomainName` | *(Optional)* Your custom domain name (e.g., `design.yourcompany.com`). If provided, you must manually create a DNS CNAME/Alias record pointing to the ALB after deployment. If blank, the default ALB DNS name is used over HTTP. | *None* |
| `AcmCertificateArn` | *(Optional)* The ARN of your AWS Certificate Manager (ACM) certificate. **Required** if `CustomDomainName` is provided. | *None* |
| `ProxyPort` | The dynamic port used by the Nginx proxy and exposed to the Load Balancer. Must be >= 1024 (unprivileged container). | `8080` |
| `AppStoragePath` | Persistent daemon storage path. Before setting or documenting it, you MUST read root [`AGENTS.md`](../../AGENTS.md) → **Daemon data directory contract**. | See root contract |

## Deployment

You can deploy this stack via the AWS Management Console or the AWS CLI.

### Using AWS Management Console

1.  Log in to the AWS Management Console and navigate to the **CloudFormation** service.
2.  Click **Create stack** and select **With new resources (standard)**.
3.  Under **Prerequisite - Prepare template**, select **Template is ready**.
4.  Under **Specify template**, select **Upload a template file**, click **Choose file**, and select the `template.yaml` file from this directory.
5.  Click **Next**.
6.  Enter a **Stack name** (e.g., `open-design-stack`).
7.  Fill in the **Parameters** according to your requirements. Note that `ApiToken`, `AllowedSourceIp`, and `DockerImage` are required.
8.  Click **Next**. Configure any stack options if desired, then click **Next** again.
9.  Scroll to the bottom of the review page, check the box that says **I acknowledge that AWS CloudFormation might create IAM resources**, and click **Submit**.

### Using AWS CLI

1.  Open your terminal and navigate to this directory.
2.  Run the `aws cloudformation deploy` command, passing in the required parameters (`ApiToken`, `AllowedSourceIp`, and `DockerImage`):

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name open-design-stack \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ApiToken="YOUR_SECURE_API_TOKEN" \
    AllowedSourceIp="YOUR_IP_ADDRESS/32" \
    DockerImage="your-registry/open-design:latest"
```

*Note: If you want to use a custom domain with HTTPS, include the `CustomDomainName` and `AcmCertificateArn` parameters in the `--parameter-overrides` list.*

## Accessing the Application

Once the CloudFormation stack creation is complete, go to the **Outputs** tab of the stack in the AWS CloudFormation Console to find the `AlbDnsName` and `AppUrl`.

**If you did NOT use a custom domain:**
Access Open Design directly using the HTTP URL provided in `AppUrl`.

**If you used a Custom Domain (HTTPS):**
You must create a DNS record to route traffic to your new load balancer. Go to your DNS provider (e.g., AWS Route53, Cloudflare) and create a CNAME or Alias (A) record that points your `CustomDomainName` to the `AlbDnsName` output value. Once DNS propagates, you can access Open Design securely via your custom HTTPS domain.
