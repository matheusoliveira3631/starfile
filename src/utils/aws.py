import logging
import os

import boto3
from botocore.exceptions import ClientError



#not sure if i'm gonna need this, uploading through js sounds like a good idea
def aws_upload(file_name, bucket, object_name, keys={}):
    # If S3 object_name was not specified, use file_name
    if object_name is None:
        object_name = file_name

    # Upload the file
    s3_client=boto3.client('s3',aws_access_key_id=keys['access_key'], 
                    aws_secret_access_key=keys['secret_key'])
    try:
        response = s3_client.upload_file(file_name, bucket, object_name)
    except ClientError as e:
        logging.error(e)
        return False
    print('Done uploading')
    return True


def get_file_url(filename ,bucket, keys={}):
   client: boto3.s3 = boto3.client(
     's3',
     aws_access_key_id=keys['access_key'],
     aws_secret_access_key=keys['secret_key']
   )

   return client.generate_presigned_url('get_object',
                                     Params={'Bucket': bucket, 'Key': filename},
                                     ExpiresIn=60)

def get_presigned_url(filename, keys={}):
    key=f"userfiles/{filename}"
    url = boto3.client('s3',aws_access_key_id=keys['access_key'],
                        aws_secret_access_key=keys['secret_key']
                        ).generate_presigned_url(
                        ClientMethod='put_object', 
                        Params={'Bucket': keys['bucket'], 'Key': key},
                        ExpiresIn=300)
    return url





