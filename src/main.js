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

const newUserList = ( list ) => {
    new Vue({
        el: '#user-list',
        data: function () {
            return {userList: list}
        },
        methods: {
            getRandomInt() {
                min = 1;
                max = 9;
                return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
            },
            toggleActive: function(user) {
                user.isActive = !user.isActive;
                fetch('/update-user', 
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
                        body: JSON.stringify(user),
                    })
                    .then(res => res.json())
                    .then(json => {
                        let i = this.userList.findIndex( u => u.id == json.id );

                        Vue.set(this.userList, i, json);

                    })
                    .catch(err => {
                        console.log(err);
                    });
            }
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

const fetchUsers = () => {
    fetch('/users')
        .then(res => res.json())
        .then(json => {
            newUserList(json);
        })
        .catch(err => {
            console.log(err);
        });
}

fetchChores();
fetchUsers();