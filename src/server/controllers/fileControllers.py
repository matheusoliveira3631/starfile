import os
from botocore.retries import bucket

from flask import request
from flask import redirect
from dotenv import load_dotenv
from flask.templating import render_template;load_dotenv()
from flask.globals import current_app
from werkzeug.utils import secure_filename

from ...database import register_file
from ...database import list_ids
from ...utils import get_file_url
from ...utils import random_range
from ...utils import aws_upload

BUCKET_NAME=os.environ['AWS_BUCKET_NAME']

keys={
    'access_key':os.environ['AWS_ACCESS_KEY'],
    'secret_key':os.environ['AWS_SECRET_KEY']
}


def fileDownload(fileId):
    url=get_file_url(f'userfiles/{fileId}', BUCKET_NAME, keys=keys)
    return redirect(url)

def file_register(filename):
    file_id=random_range(10)
    id_list=list_ids()
    while file_id in id_list:
        file_id=random_range(10)
    
    register_file(filename, file_id)
    return file_id

def fileUpload(request):
    try:
        file = request.files['file']
        filename = secure_filename(file.filename)
        filePath=os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        fileFormat=filename.split('.')[-1]
        file.save(filePath)
        try:
            file_id=file_register(filename)
            aws_upload(filePath, BUCKET_NAME, f'userfiles/{file_id}.{fileFormat}', keys=keys)
            return render_template('post.html', id=f'{file_id}.{fileFormat}')
        except EnvironmentError as err:
            print(err)
            return render_template('error.html')
    except EnvironmentError as err:
        print(err)
        return render_template('error.html')

