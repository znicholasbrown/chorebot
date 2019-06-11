let mongoose = require('mongoose');
let express = require('express');
let bodyParser = require('body-parser');
let schedule = require('node-schedule');
let util = require('util');
let moment = require('moment');

// Slackbot section
const { WebClient } = require('@slack/web-api');

require('dotenv').config({path: __dirname + '/.env'})

const token = process.env.BOT_TOKEN;
const channel_id = process.env.CHANNEL_ID || 'chorebot';

let web = new WebClient(token);

const params = {
    icon_emoji: ':cat:',
    as_user: true
}

// Database Function Section
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);

let connection = mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true });

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

const UserSchema = new Schema({
    id: String,
    email: String,
    name: String,
    userName: String,
    image: String,
    isActive: { type: Boolean, default: true },
    score: { type: Number, default: 0 },
    recentTask: { type: String, default: '' },
    assignedTask: { type: Boolean, default: false },
    assignedTaskId: { type: String, default: false },
    isUnavailable: { type: Boolean, default: false },
    respondedToMessage: { type: Boolean, default: false }
});

const User = mongoose.model('slack_user', UserSchema);

// Makes sure we have any new members that have been added to Slack!
const updateUsers = async () => {
    console.log('Updating users')

    const users = await web.users.list({}).catch(e => console.log(e));

    // Filter any users who have been deleted or are bots
    await users.members.filter(user => !user.deleted && !user.is_bot).forEach( async (u) => {
        let userModel = {
            id: u.id,
            email: u.profile.email,
            name: u.profile.real_name_normalized,
            userName: u.name,
            image: u.profile.image_512
        }

        await User.findOneAndUpdate({ id: u.id }, userModel, { upsert: true, new: true, setDefaultsOnInsert: true }, (err, res) => {
            if (err) {
                console.log(util.inspect(err));
            }
        });
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

app.use(express.static('src'));

let jsonParser = bodyParser.json();
let urlEncodedParser = bodyParser.urlencoded({ extended: false });

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/src/index.html');
});

app.get('/chores', (req, res) => {
    Chore.find({ deleted: false }, ( err, docs ) => {
        if (err) {
            console.log(util.inspect(err));
            return 400;
        }
        return res.json(docs);
    });
});

app.get('/users', (req, res) => {
    User.find({}, ( err, docs ) => {
        if (err) {
            console.log(util.inspect(err));
            return 400;
        }
        return res.json(docs);
    });
});

// app.get('/complete-chore', (req, res) => {
//     User.find({}, ( err, docs ) => {
//         if (err) {
//             console.log(util.inspect(err));
//             return 400;
//         }
//         return res.json(docs);
//     });
// });

// Could probably switch these to a single /user route that updates the whole user
app.post('/update-user', jsonParser, (req, res) => {
    User.updateOne({ _id: req.body._id }, req.body, ( err, user ) => {
        res.send(user);
    });
});

app.post('/add', jsonParser, (req, res) => {
    new Chore(req.body).save( (err, chore) => {
        if (!err) {
            res.sendStatus(200);

            if (req.body.notification === false) return console.log(`${chore.title} added by ${chore.creator}.`);

            web.chat.postMessage({
                channel: channel_id,
                text: `${chore.title} added by ${chore.creator}.`,
                ...params
            }).catch(e => console.log(e));
        }
    });
});

app.get('/make-new-assignments', async (req, res) => {
    await updateUsers();
    authorize(listOOOEvents);

    web.chat.postMessage({
        channel: channel_id,
        text:  `Chores have been assigned.`,
        ...params
    }).catch(e => console.log(e));

    res.sendStatus(200);
});

app.post('/delete', jsonParser, (req, res) => {
    Chore.findById( req.body.id, ( err, chore ) => {
        chore.deleted = true;
        chore.save( errorCallback );
        
        if (!err) {
            res.sendStatus(200);
            
            if (req.body.notification === false) return console.log(`${chore.title} removed.`);
            
            web.chat.postMessage({
                channel: channel_id,
                text:  `${chore.title} removed.`,
                ...params
            }).catch(e => console.log(e));
        }
    });
});

app.post('/message-endpoint', urlEncodedParser, async (req, res) => {
    res.sendStatus(200).end();

    let payload = JSON.parse(req.body.payload);
    let response = '';

    switch( payload.actions[0].value ) {
        case 'available':

            let date = new Date(),
                year = date.getFullYear(),
                month = date.getMonth(),
                day  = date.getDate(),
                hour = date.getHours(),
                minute = date.getMinutes(),
                second = date.getSeconds() + 10;

            let time = new Date(year, month, day, hour, minute, second).getTime();

            response = `Great! I'll check in *${moment(time).fromNow()}* to see if you were able to complete the chore!`;
            setTaskReminder(payload.user.id, time); 
            break;
        case 'unavailable':
            response = "No problem! I'll reassign the chore."
            // Pass in the slack user id
            // We'll use that to find the correct chore to reassign
            reassignChore(payload.user.id);
            break;
        case 'complete':
            response = "Well done! You make the office a better place 😋"
            break;
        case 'incomplete':
            response = "Uhoh! ☹️ Contributing to the office is important for everyone. Hopefully you'll be able to next time!"
            break;
    }

    await web.chat.update({
        'channel': payload.channel.id,
        'ts': payload.container.message_ts,
        'text': response,
        'as_user': true,
        "replace_original": "true",
        'blocks': [
            payload.message.blocks[0], // This gets the first block so that the chore description isn't lost.
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": response
                }
            }
        ]
    });

});


// Close the server and db connection
let server = app.listen(port, () => console.log(`App listening on port ${port}.`));

process.on( 'SIGTERM', () => {
    console.log('Exiting.');

    server.close( () => {
      console.log('Server closed.');
    });
    
    mongoose.connection.close( () => {
        console.log('Database connection closed.');
    })
 });



// Job scheduler
schedule.scheduleJob('0 10 * * 1-5', (sched) => {
    updateUsers();

    // Resets the assigned tasks at the beginning of the day. 
    User.find(( err, user ) => {
        if (err) {
            console.log(err);
            return 400;
        }
        
        users.forEach( user => {
            user.assignedTask = false;
            user.assignedTaskId = false;
            user.save();
        });
    });


    Chore.find({ deleted: false }, ( err, docs ) => {
        if (err) {
            console.log(util.inspect(err));
            return 400;
        }

        docs = docs.filter( d => d.frequency.includes(new Date().getDay()) );

        web.chat.postMessage({
            channel: channel_id,
            text:  `The scheduled chores for today are: ${docs.reduce( (acc, doc) => [...acc, doc.title], []).join(', ')}`,
            ...params
        }).catch(e => console.log(e));

        authorize(listOOOEvents);
    });
});


// Google API auth section

const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from env.
function authorize(callback) {
    const {client_secret, client_id, redirect_uris} = {
        client_secret: process.env.client_secret, 
        client_id: process.env.client_id, 
        redirect_uris: ["urn:ietf:wg:oauth:2.0:oob","http://localhost"]
    }

    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);
  
    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
    //   if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials({
          "access_token": process.env.access_token,
          "refresh_token": process.env.refresh_token,
          "scope": process.env.scope,
          "token_type": process.env.token_type,
          "expiry_date": process.env.expiry_date
        });
      callback(oAuth2Client);
    });
  }

function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error retrieving access token', err);
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
            if (err) return console.error(err);
            console.log('Token stored to', TOKEN_PATH);
        });
        callback(oAuth2Client);
        });
    });
}


function listOOOEvents(auth) {
    const calendar = google.calendar({version: 'v3', auth});
    // Can add US Holiday calendar
    // en.usa#holiday@group.v.calendar.google.com
    calendar.events.list({
      calendarId: process.env.CALENDAR_ID,
      timeMin: (new Date(new Date().setHours(0,0,0,0))).toISOString(),
      timeMax: (new Date(new Date().setHours(23,59,59,0))).toISOString(),
      singleEvents: true,
      alwaysIncludeEmail: true,
      orderBy: 'startTime',
    }, (err, res) => {
      if (err) return console.log('The API returned an error: ' + err);
      const events = res.data.items;
      if (events.length) {
        let ooo = []
        events.map((event, i) => {
          if ( !ooo.includes(event.creator.email) ) {
              ooo.push(event.creator.email)
          }
        });
        assignChores(ooo);
      } else {
        console.log('No upcoming events found.');
      }
    });
}

// Chore assignment logic

const assignChores = async ( outOfOffice ) => {
    console.log('Assigning chores...');
    let availableUsers = [],
        currentChores = [];

    await User.find({ isActive: true }, ( err, us ) => {
        if (err) {
            console.log(err);
        }
        if ( !us || us.length === 0 ) return console.log('No users...');

        us.forEach( user => {
            user.assignedTask = false;
            user.assignedTaskId = false;
            user.isUnavailable = false;
            

            // Doesn't include those in the out of office calendar
            if ( !outOfOffice.includes(user.email) ) {
                user.isUnavailable = true;
                availableUsers.push(user);
            }

            user.save();
        });

        if ( availableUsers.length === 0 ) return console.log('No available users...');

        console.log(`The available people are ${ availableUsers.reduce( (aUsers, u) => [...aUsers, u.name], [] ).join(', ')}`);
    });


    await Chore.find({ deleted: false }, ( err, ch ) => {
        
        if (err) {
            console.log(util.inspect(err));
        }

        if ( !ch || ch.length === 0 ) return console.log('No available chores...');

        ch = ch.filter( c => c.frequency.includes(new Date().getDay()) ).sort( (a, c) => c.difficulty - a.difficulty );

        console.log(`The available chores are ${ ch.reduce( (chs, ch) => [...chs, ch.title], [] ).join(', ')}`);
        currentChores = ch;
    });

    currentChores.forEach( async (chore) => {
        // let assignedUser = availableUsers.find( (u) => !u.assignedTask );
        let assignedUser = availableUsers.find( (u) => u._id == "5cfd174d3666580004a97b03" );

        assignedUser.assignedTask = true;

        await User.findByIdAndUpdate(assignedUser._id, {assignedTaskId: chore.id, assignedTask: true}, { new: true }, async (err, user) => {
            if (err) {
                console.log(err);
            }

            console.log(`${user.name} has been assigned ${chore.title}.`)
            sendChoreMessage(user, chore);
        });
    });
}

const reassignChore = async (id) => {
    let taskId = '';

    // Mark the current user as unavailable
    await User.findOneAndUpdate({ id: id }, { isUnavailable: true }, { new: true}, ( err, user ) => {
        if (err) console.log(util.inspect(err));

        taskId = user.assignedTaskId;
    });

    // Find the next lowest-scored user who is available, is active, and hasn't been assigned as task
    // await User.findOne({ isActive: true, assignedTask: false, assignedTaskId: false, isUnavailable: false })
    await User.findOne({ isActive: true })
    .sort('-score')
    .exec( async ( err, user ) => {
        if (err) {
            console.log(err);
        }
        if ( !user || user.length === 0 ) return console.log('No users...');

        user.assignedTaskId = taskId;
        user.assignedTask = true;
        user.save();

        await Chore.findOne({ _id: taskId }, (err, chore) => {
            sendChoreMessage(user, chore);
        });
    });
}

const sendChoreMessage = async (user, chore) => {
    // For now it'll just notify me
    let blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `Hi ${user.name}, you've been assigned the chore *${chore.title}*.\n\n *Are you available to *${chore.title.toLowerCase()}*? If not, I'll reassign this chore to someone else.`
            }
        },
        {
            "type": "actions",
            "elements": [
                {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "I'm available",
                    "emoji": true
                    },
                "style": "primary",
                "value": "available"
                },
                {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "I'm not available",
                    "emoji": true
                    },
                "style": "danger",
                "value": "unavailable"
                }
            ]
        }
    ]

    await web.chat.postMessage({
        text: `Hi ${user.name}, you've been assigned the chore *${chore.title}*.`,
        mrkdwn: true,
        channel: user.id,
        as_user: true,
        blocks: blocks,
    }).catch(e => console.log(e));
}

const setTaskReminder = async (id, time) => {
    let taskId = '';

    await User.findOne({ id: id }, ( err, user ) => {
        if (err) console.log(util.inspect(err));

        taskId = user.assignedTaskId;
    });

    await Chore.findOne({ _id: taskId }, async (err, chore) => {

        console.log(time)
        await web.chat.scheduleMessage({
            "channel": id,
            "text": `Hi! Were you able to ${chore.title} today?`,
            "post_at": time / 1000,
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `Hi! Were you able to *${chore.title.toLowerCase()}* today?`
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Yes! 😁",
                            "emoji": true
                            },
                        "style": "primary",
                        "value": "complete"
                        },
                        {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "No 😔",
                            "emoji": true
                            },
                        "style": "danger",
                        "value": "incomplete"
                        }
                    ]
                }
            ]
        });
    });
}