let mongoose = require('mongoose');
let express = require('express');
let util = require('util');

// Slackbot section
let SlackBot = require('slackbots');

require('dotenv').config({path: __dirname + '/.env'})

const token = process.env.BOT_TOKEN;

// create the bot
let bot = new SlackBot({
    token: token,
    name: 'Chores Bot'
});

bot.on('message', ( message ) => {
    let params = {
        icon_emoji: ':cat:',
        as_user: true
    }
    if ( message.text && message.text.includes('<@UK0323283>') ) {
        bot.postMessage(message.user, 'meow!', params);
    }
});


// Database Function Section
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true });

const Schema = mongoose.Schema;
 
const ChoreSchema = new Schema({
    title: String,
    instructions: String,
    difficulty: { type: Number, min: 1, max: 4 },
    date: { type: Date, default: Date.now },
    creator: String,
    frequency: [{ type: Number, default: [0, 1, 2, 3, 4, 5, 6]}],
    deleted: { type: Boolean, default: false }
});

const Chore = mongoose.model('chore', ChoreSchema);

const getChores = () => {
    Chore.find({ deleted: false }, ( err, docs ) => {
        if (err) {
            console.log(util.inspect(err));
            return 400;
        }
        console.log(util.inspect(docs));
        return docs;
    });
}

const getDeletedChores = () => {
    Chore.find({ deleted: true }, ( err, docs ) => {
        if (err) {
            console.log(err);
            return 400;
        }
        console.log(util.inspect(docs));
        return docs;
    });
}

const addChore = ( choreData ) => {
    new Chore(choreData).save( errorCallback );
}

const deleteChore = ( choreId ) => {
    Chore.findById( choreId, ( err, chore ) => {
        if (err) {
            console.log(util.inspect(err));
            return 400;
        }

        chore.deleted = true;
        chore.save( errorCallback );
    });
}

const reinstateDeletedChore = ( choreId ) => {
    Chore.findById( choreId, ( err, chore ) => {
        if (err) {
            console.log(util.inspect(err));
            return 400;
        }

        chore.deleted = false;
        chore.save( errorCallback );
    });
}

const errorCallback = ( err ) => {
    if (err) {
        console.log(util.inspect(err));
        return 400;
    }
}

// Webserver section
const app = express();
const port = process.env.PORT || 3019;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => console.log(`App listening on port ${port}.`));