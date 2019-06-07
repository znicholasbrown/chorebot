let savedChore = {
    title: '',
    instructions: '',
    creator: '',
    difficulty: '',
    frequency: []
}

const addFab = new Vue({
    el: '#add-chore',
    data: {
        modalOpened: false
    },
    methods: {
        toggleModal: () => this.modalOpened ? closeModal() : openModal(),
    }
});


const newChoreList = ( list ) => {
    new Vue({
        el: '#chore-list',
        data: function () {
            return {choreList: list}
        },
        methods: {
            deleteChore: function (id) {
                fetch('/delete', 
                    {
                        method: 'POST',
                        mode: 'cors',
                        cache: 'no-cache',
                        credentials: 'same-origin',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        redirect: 'follow',
                        referrer: 'no-referrer',
                        body: JSON.stringify({id: id}),
                    })
                        .then(res => {
                            location.reload();
                        })
                        .catch(err => {
                            console.log(err);
                        });
            },
            closeModal: (chore) => closeModal(chore)
        }
    })
}

const dialog = document.querySelector('dialog');

const openModal = () => {
    dialog.showModal();
}
const closeModal = ( saved ) => {
    if (saved) savedChore = saved;
    dialog.close();
}

const addChoreForm = new Vue({
    el: '#add-chore-form',
    data: function() {
        return {chore: savedChore}
    },
    methods: {
        save: function (chore) {
            fetch('/add', 
            {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                redirect: 'follow',
                referrer: 'no-referrer',
                body: JSON.stringify(this.chore),
            })
                .then(res => {
                    location.reload();
                })
                .catch(err => {
                    console.log(err);
                });
        },
        closeModal: (chore) => closeModal(chore)
    }
  });

const fetchChores = () => {
    fetch('/chores')
        .then(res => res.json())
        .then(json => {
            newChoreList(json);
        })
        .catch(err => {
            console.log(err);
        });
}

fetchChores();