from flask import Blueprint
from flask.globals import request
from flask import render_template

from .controllers import fileController

app = Blueprint('app', __name__)

@app.route('/')
def homepage():
    return render_template('homepage.html')


@app.route('/file/<string:fileId>')
def download(fileId):
    return fileController().fileDownload(fileId)

@app.route('/upload', methods=['POST'])
def upload():
    return fileController().fileUpload(request)

