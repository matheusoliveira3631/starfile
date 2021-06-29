import os

import boto3
from dotenv import load_dotenv; load_dotenv()

ACCESS_KEY=os.environ['aws_access_key']
SECRET_KEY=os.environ['aws_secret_key']
region_name=os.environ['aws_region_name']

def register_file(filename, file_id):
    client = boto3.resource('dynamodb', aws_access_key_id=ACCESS_KEY, 
    aws_secret_access_key=SECRET_KEY, region_name=region_name)
    table=client.Table('userfiles')
    response = table.put_item(
    Item={
            'fileId':file_id,
            'fileName':filename
        }
    )
    return response    
        
def get_file_id(filename):
    client = boto3.resource('dynamodb', aws_access_key_id=ACCESS_KEY, 
    aws_secret_access_key=SECRET_KEY, region_name=region_name)
    table=client.Table('userfiles')
    try:
        response = table.get_item(Key={'fileName':filename})
    except EnvironmentError as e:
        print(e.response['Error']['Message'])
    
    return response['Item']['file_id']

def list_ids():
    client = boto3.resource('dynamodb', aws_access_key_id=ACCESS_KEY, 
    aws_secret_access_key=SECRET_KEY, region_name=region_name)
    table=client.Table('userfiles')
    response= [x['file_id'] for x in table.scan()['Items']]
    return response