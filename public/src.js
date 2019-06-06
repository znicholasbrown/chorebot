fetch('/chores')
    .then(res => res.json())
    .then(json => {
        console.log(json);
        let choreList = new Vue({
            el: '#chore-list',
            data: {
                choreList: json
            }
        })
    })
    .catch(err => {
        console.log(err);
    });


