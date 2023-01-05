import os

class Config(object):
    pass

class devConfig(Config):
    def __init__(self, app):
        self.app=app

    @property
    def UPLOAD_FOLDER(self):
        folder = os.path.join(self.app.root_path, 'userUploads')
        if os.path.isdir(folder):
            return folder
        else:
            os.mkdir(folder)
            return folder
    DB_NAME = "files" 
    ENV = 'development'
    DEBUG = True
    
class productionConfig(Config):
    def __init__(self, app):
        self.app=app

    @property
    def UPLOAD_FOLDER(self):
        folder = os.path.join(self.app.root_path, 'userUploads')
        if os.path.isdir(folder):
            return folder
        else:
            os.mkdir(folder)
            return folder
    DB_NAME = "files" 
    ENV= 'production'
    DEBUG= False
    