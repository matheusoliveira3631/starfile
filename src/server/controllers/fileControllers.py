import os

from flask import request
from flask import redirect
from dotenv import load_dotenv;load_dotenv()

from ...utils import get_file_url
from ...utils import random_range
from ...database import register_file
from ...database import list_ids

keys={
    'access_key':os.environ['AWS_ACCESS_KEY'],
    'secret_key':os.environ['AWS_SECRET_KEY']
}


def fileDownload(filename):
    url=get_file_url(f'userfiles/{filename}', 'fhostbucket', keys=keys)
    return url

def file_register(filename):
    file_id=random_range(10)
    id_list=list_ids()
    while file_id in id_list:
        file_id=random_range(10)
    try:
        register_file(filename, file_id)
        return file_id
    except:
        return 500



