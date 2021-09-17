import os

import boto3
from flask import render_template
from flask import jsonify
from dotenv import load_dotenv;load_dotenv()

keys={
    'access_key':os.environ['AWS_ACCESS_KEY'],
    'secret_key':os.environ['AWS_SECRET_KEY'],
    'bucket':os.environ['AWS_BUCKET_NAME']
}

def homepage():
    return render_template('homepage.html')
