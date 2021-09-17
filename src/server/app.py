from flask import Blueprint
from flask.globals import request


from .controllers import homepage
from .controllers import fileDownload
from .controllers import file_register
from .controllers import fileUpload

app = Blueprint('app', __name__)

@app.route('/')
def home():
    return homepage()

@app.route('/file/<string:fileId>')
def download(fileId):
    return fileDownload(fileId)

@app.route('/register/<string:filename>', methods=['POST'])
def fileRegister(filename):
    return file_register(filename)


@app.route('/upload', methods=['POST'])
def upload():
    return fileUpload(request)