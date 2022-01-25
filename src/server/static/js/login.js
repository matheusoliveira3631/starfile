const button=document.getElementById('button');
const form=document.getElementById('form-container');
const gallery=document.getElementById('gallery-controller');
const field=document.getElementById('field')

const switchPanes = ()=>{
    form.style.display='none';
    gallery.style.display='flex';
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


button.addEventListener('click', auth);