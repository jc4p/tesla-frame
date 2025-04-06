import os
import boto3
from botocore.config import Config
import argparse
from pathlib import Path

def upload_to_r2(access_key, secret_key, account_id, bucket_name, source_dir):
    # Configure the S3 client for R2
    s3 = boto3.client(
        's3',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name='auto',
        config=Config(signature_version='s3v4')
    )

    glb_files = list(Path(source_dir).glob('*.png'))
    
    if not glb_files:
        print(f"No PNG files found in {source_dir}")
        return

    print(f"Found {len(glb_files)} PNG files to upload")
    
    # Upload each file
    for file_path in glb_files:
        file_name = file_path.name
        print(f"Uploading {file_name}...")
        
        try:
            s3.upload_file(
                str(file_path),
                bucket_name,
                file_name,
                ExtraArgs={
                    'ContentType': 'image/png',
                    'CacheControl': 'public, max-age=31536000'  # Cache for 1 year
                }
            )
            print(f"Successfully uploaded {file_name}")
        except Exception as e:
            print(f"Error uploading {file_name}: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description='Upload PNG files to Cloudflare R2')
    parser.add_argument('--access-key', required=True, help='R2 Access Key')
    parser.add_argument('--secret-key', required=True, help='R2 Secret Key')
    parser.add_argument('--account-id', required=True, help='Cloudflare Account ID')
    parser.add_argument('--bucket', required=True, help='R2 Bucket Name')
    parser.add_argument('--source-dir', default='public', help='Source directory containing PNG files')
    
    args = parser.parse_args()
    
    upload_to_r2(
        args.access_key,
        args.secret_key,
        args.account_id,
        args.bucket,
        args.source_dir
    )

if __name__ == '__main__':
    main()
