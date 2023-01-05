import random

class Database():
    def __init__(self, db) -> None:
        self.database = db

    def fileRegistration(self, filename, fileId):
        self.database.insert({'fileName': filename, 'fileId': fileId})

    def listIds(self):
        print(self.database.all())
        return [el['fileId'] for el in self.database.all()]

    def getFileName(self, query, fileId):
        doc = self.database.search(query.fileId == fileId)
        print(fileId)
        print(doc)
        return doc[0]['fileName']