import os

import boto3
from flask import render_template
from flask import jsonify

def homepage():
    return render_template('homepage.html')
