#!/usr/bin/env bash
# =============================================================================
# Decarbonarma — One-time AWS infrastructure setup
# Run once from your terminal: bash setup-aws.sh
# Requires: AWS CLI configured (aws configure) with admin permissions
# =============================================================================

set -euo pipefail

# ── CONFIG ────────────────────────────────────────────────────────────────────
BUCKET_NAME="decarbonarma-website"
REGION="eu-west-2"           # London — closest to UK audience
DOMAIN="decarbonarma.co.uk"  # Update once you've registered your domain
# ─────────────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
step() { echo -e "\n${GREEN}▶ $1${NC}"; }
info() { echo -e "  ${YELLOW}→${NC} $1"; }

# ── 1. S3 BUCKET ──────────────────────────────────────────────────────────────
step "Creating S3 bucket: $BUCKET_NAME"
aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

info "Bucket created and locked to public access"

# ── 2. CLOUDFRONT ORIGIN ACCESS CONTROL ───────────────────────────────────────
step "Creating CloudFront Origin Access Control"
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config \
    "Name=decarbonarma-oac,Description=Decarbonarma S3 OAC,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
  --query 'OriginAccessControl.Id' \
  --output text)
info "OAC ID: $OAC_ID"

# ── 3. CLOUDFRONT DISTRIBUTION ────────────────────────────────────────────────
step "Creating CloudFront distribution (takes ~5 mins to propagate)"

DISTRIBUTION_CONFIG=$(cat <<JSON
{
  "CallerReference": "decarbonarma-$(date +%s)",
  "Comment": "Decarbonarma website",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-decarbonarma",
      "DomainName": "${BUCKET_NAME}.s3.${REGION}.amazonaws.com",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "OriginAccessControlId": "${OAC_ID}"
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-decarbonarma",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true,
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET","HEAD"]
    }
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [{
      "ErrorCode": 404,
      "ResponsePagePath": "/index.html",
      "ResponseCode": "200",
      "ErrorCachingMinTTL": 10
    }]
  },
  "PriceClass": "PriceClass_100",
  "Enabled": true,
  "HttpVersion": "http2and3"
}
JSON
)

DIST_OUTPUT=$(aws cloudfront create-distribution \
  --distribution-config "$DISTRIBUTION_CONFIG")

DIST_ID=$(echo "$DIST_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Distribution']['Id'])")
DIST_DOMAIN=$(echo "$DIST_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Distribution']['DomainName'])")

info "Distribution ID:  $DIST_ID"
info "CloudFront URL:   https://$DIST_DOMAIN"

# ── 4. S3 BUCKET POLICY (allow CloudFront OAC) ────────────────────────────────
step "Attaching bucket policy for CloudFront access"

BUCKET_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAC",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET_NAME}/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::$(aws sts get-caller-identity --query Account --output text):distribution/${DIST_ID}"
      }
    }
  }]
}
JSON
)

aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy "$BUCKET_POLICY"
info "Bucket policy applied"

# ── 5. IAM DEPLOY USER (for GitHub Actions) ───────────────────────────────────
step "Creating IAM user for GitHub Actions deploys"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iam create-user --user-name decarbonarma-deploy 2>/dev/null || info "User already exists"

DEPLOY_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Sync",
      "Effect": "Allow",
      "Action": ["s3:PutObject","s3:DeleteObject","s3:GetObject","s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::${BUCKET_NAME}",
        "arn:aws:s3:::${BUCKET_NAME}/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidate",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"
    }
  ]
}
JSON
)

POLICY_ARN=$(aws iam create-policy \
  --policy-name decarbonarma-deploy-policy \
  --policy-document "$DEPLOY_POLICY" \
  --query 'Policy.Arn' --output text)

aws iam attach-user-policy --user-name decarbonarma-deploy --policy-arn "$POLICY_ARN"

KEYS=$(aws iam create-access-key --user-name decarbonarma-deploy)
ACCESS_KEY=$(echo "$KEYS" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessKey']['AccessKeyId'])")
SECRET_KEY=$(echo "$KEYS" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessKey']['SecretAccessKey'])")

# ── 6. INITIAL SITE UPLOAD ────────────────────────────────────────────────────
step "Uploading site to S3"
aws s3 sync "$(dirname "$0")" "s3://$BUCKET_NAME" \
  --delete \
  --exclude ".git/*" \
  --exclude ".DS_Store" \
  --exclude "*.md" \
  --exclude "Archive.zip" \
  --exclude "setup-aws.sh" \
  --exclude "qr-code*" \
  --exclude "marketing-strategy.md"

info "Site uploaded"

# ── 7. SUMMARY ────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅  Setup complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  CloudFront URL:  https://$DIST_DOMAIN"
echo "  (Live in ~5 minutes while CloudFront propagates)"
echo ""
echo "  ── Add these secrets to GitHub ──────────────────────"
echo "  AWS_ACCESS_KEY_ID:          $ACCESS_KEY"
echo "  AWS_SECRET_ACCESS_KEY:      $SECRET_KEY"
echo "  AWS_S3_BUCKET:              $BUCKET_NAME"
echo "  CLOUDFRONT_DISTRIBUTION_ID: $DIST_ID"
echo ""
echo "  ── Next steps ───────────────────────────────────────"
echo "  1. Copy the 4 secrets above into GitHub → Settings → Secrets → Actions"
echo "  2. Register decarbonarma.co.uk in Route 53 (Console → Route 53 → Register Domain)"
echo "  3. Run: bash setup-domain.sh  (after domain is registered)"
echo "════════════════════════════════════════════════════════"
