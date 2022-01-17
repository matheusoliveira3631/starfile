import os

import boto3
from dotenv import load_dotenv; load_dotenv()

ACCESS_KEY=os.environ['AWS_ACCESS_KEY']
SECRET_KEY=os.environ['AWS_SECRET_KEY']
region_name=os.environ['AWS_REGION_NAME']

def register_file(filename, file_id):
    client = boto3.resource('dynamodb', aws_access_key_id=ACCESS_KEY, 
    aws_secret_access_key=SECRET_KEY, region_name=region_name)
    table=client.Table('userfiles')
    response = table.put_item(
    Item={
            'fileId':int(file_id),
            'fileName':filename
        }
    )
    return response    
        
def get_file_name(file_id):
    client = boto3.resource('dynamodb', aws_access_key_id=ACCESS_KEY, 
    aws_secret_access_key=SECRET_KEY, region_name=region_name)
    table=client.Table('userfiles')
    try:
        response = table.get_item(Key={'fileId':file_id})
    except EnvironmentError as e:
        print(e.response['Error']['Message'])
    
    return response['Item']['fileName']

def list_ids():
    client = boto3.resource('dynamodb', aws_access_key_id=ACCESS_KEY, 
    aws_secret_access_key=SECRET_KEY, region_name=region_name)
    table=client.Table('userfiles')
    response= [x['fileId'] for x in table.scan()['Items']]
    return response