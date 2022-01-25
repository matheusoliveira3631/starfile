from flask import Blueprint
from flask.globals import request


from .controllers import homepage
from .controllers import fileDownload, galleryUpload
from .controllers import file_register
from .controllers import fileUpload
from .controllers import gallery
from .controllers import authenticate

app = Blueprint('app', __name__)

@app.route('/')
def home():
    return homepage()

@app.route('/gallery')
def gal():
    return gallery()

@app.route('/auth', methods=['POST'])
def auth():
    return authenticate(request)

@app.route('/file/<string:fileId>')
def download(fileId):
    return fileDownload(fileId)

@app.route('/register/<string:filename>', methods=['POST'])
def fileRegister(filename):
    return file_register(filename)


@app.route('/upload', methods=['POST'])
def upload():
    return fileUpload(request)

@app.route('/upload/image', methods=['POST'])
def imgUpload():
    return galleryUpload(request)