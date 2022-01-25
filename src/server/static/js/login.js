const button=document.getElementById('button');
const form=document.getElementById('form-container');
const gallery=document.getElementById('gallery-container');
const field=document.getElementById('field')
const addPhoto=document.getElementById('add-photo')
const photoForm=document.getElementById('photo-form')
const photoButton=document.getElementById('photo-upload')
const photos=document.getElementsByClassName('photo-element')
const modal=document.getElementById('modal')
const main=document.getElementById('main')

const switchPanes = ()=>{
    form.style.display='none';
    main.style.display='block';
}

const auth = (eventObj)=>{
    eventObj.preventDefault();
    const password=field.value
    fetch('/auth',{
        method:'POST',
        body:JSON.stringify({'password':password}),
        headers: {
            'Content-Type': 'application/json'
        },
    }).then(res=>{
        res.status==200 ? switchPanes() : window.location.replace(window.location.origin);
    })
}

const newImage = (imgName)=>{
    const container=document.createElement('img');
    container.classList.add('gallery-element');
    container.src=`/assets/images/galleryUploads/${imgName}`;
    gallery.appendChild(container);
}

const openModal = (event)=>{
    let modal=document.getElementById('modal');
    let img= modal.getElementsByTagName('img')[0];
    img.src=event.srcElement.src;
    modal.style.display='flex';
}

button.addEventListener('click', auth);
addPhoto.addEventListener('click', ()=>{
    photoButton.click()
})

photoButton.onchange = (event)=>{
    photoForm.submit()
    spl=photoButton.value.split('\\') 
    setTimeout(() => {
        newImage(spl[spl.length-1]);
    }, 2000);
}

for (let x of photos){
    x.addEventListener('click', (event)=>{openModal(event)})
}

const close = ()=>{
    modal.style.display='none';
}

modal.getElementsByTagName('p')[0].addEventListener('click', close)
