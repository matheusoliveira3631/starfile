const nameSpace=document.getElementById('file-name');
const inputElement = document.getElementById("upload-input");
const inputButton = document.getElementById('up-label');
const cancelButton = document.getElementById('cancel-button');
const uploadButton = document.getElementById('upload-button');

function fileSize(size){
    if (size <=100){return `${size}b`} else
    if (size <=10**5){return `${parseInt(size/1000)}Kb`} else
    if (size <=10**8){return `${parseInt(size/10**6)}Mb`} else
    if (size <=10**11){return `${parseInt(size/10**9)}Gb`}
}

function handleFiles() {
    const file = this.files[0]
    const name=file.name
    const size=fileSize(file.size)
    const span = document.createElement('span')
    span.id = 'file-size'
    span.innerText=size
    nameSpace.innerText=name
    nameSpace.appendChild(document.createElement('br'))
    nameSpace.appendChild(span)
    uploadButton.disabled=false  
}

function reset(){
    const span = document.createElement('span')
    span.id = 'file-size'
    span.innerText='No size'
    nameSpace.innerText='No file selected'
    nameSpace.appendChild(document.createElement('br'))
    nameSpace.appendChild(span)
    uploadButton.disabled=true
}

function submit(){
    const form=document.getElementById('upload-form')
    form.submit()
}

inputElement.addEventListener("change", handleFiles, false);
cancelButton.addEventListener('click', reset, false);
uploadButton.addEventListener('click', submit, false);