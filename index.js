let mongoose = require('mongoose');
let express = require('express');
let bodyParser = require('body-parser');
let schedule = require('node-schedule');
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

const params = {
    icon_emoji: ':cat:',
    as_user: true
}

const daysOfTheWeek = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday'
}

bot.on('message', ( message ) => {
    if ( message.text && message.text.includes('<@UK0323283>') ) {
        bot.postMessage(message.user, 'meow!', params);
    }
});


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
    image: String,
    isActive: { type: Boolean, default: true },
    score: { type: Number, default: 0 },
    recentTask: { type: String, default: '' },
    assignedTask: { type: Boolean, default: false },
    assignedTaskId: { type: String, default: false },
    respondedToMessage: { type: Boolean, default: false }
});

const User = mongoose.model('slack_user', UserSchema);

// Makes sure we have any new members that have been added to Slack!
const updateUsers = async () => {
    await bot.getUsers().then( async (users) => {
        // Filer any users who have been deleted or are bots
        await users.members.filter(user => !user.deleted && !user.is_bot).forEach( async (user) => {
            // Have to do this to get user emails, which we'll compare to google calendar
            await bot.getUserById(user.id).then( async (u) => {
                let userModel = {
                    id: u.id,
                    email: u.profile.email,
                    name: u.profile.real_name_normalized,
                    image: u.profile.image_512
                }

                await User.findOneAndUpdate({ id: u.id }, userModel, { upsert: true, new: true, setDefaultsOnInsert: true }, (err, res) => {
                    if (err) {
                        console.log(util.inspect(err));
                    }
                });
            }).catch( e => console.log(util.inspect(e)));
        });
    });
}
updateUsers();

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

// Could probably switch these to a single /user route that updates the whole user
app.post('/update-user', jsonParser, (req, res) => {
    console.log(req.body);
    User.updateOne(req.body, ( err, user ) => {
        res.send(user);
    });
});

app.post('/add', jsonParser, (req, res) => {
    new Chore(req.body).save( (err, chore) => {
        if (!err) {
            res.sendStatus(200);

            bot.getChannel('chorebot').then(c => {
                bot.postMessageToChannel(c.name, `${chore.title} added by ${chore.creator}.`, params, function(data) {
                    console.log(data);
                });
            });
        }
    });
});

app.post('/delete', jsonParser, (req, res) => {
    Chore.findById( req.body.id, ( err, chore ) => {
        chore.deleted = true;
        chore.save( errorCallback );
        
        if (!err) {
            res.sendStatus(200);
            
            bot.getChannel('chorebot').then(c => {
                bot.postMessageToChannel(c.name, `${chore.title} removed.`, params, function(data) {
                    console.log(data);
                });
            });
        }
    });
});



// Close the server and db connection
let server = app.listen(port, () => console.log(`App listening on port ${port}.`));

process.on( 'SIGTERM', () => {
    console.log('Exiting.');

    server.close( () => {
      console.log('Server closed.');
    });
    
    connection.close( () => {
        console.log('Database connection closed.');
    })
 });



// Job scheduler
schedule.scheduleJob('* 10 * * *', (sched) => {
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

        bot.getChannel('chorebot').then(c => {
            bot.postMessageToChannel(c.name, `The scheduled chores for today are: ${docs.reduce( (acc, doc) => [...acc, doc.title], []).join(', ')}`, params, function(data) {
                console.log(data);
            });
        });
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
authorize(listOOOEvents);

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
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
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
          const start = event.start.dateTime || event.start.date;
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
            return 400;
        }

        us.forEach( user => {
            user.assignedTask = false;
            user.assignedTaskId = false;
            user.save();

            if ( !outOfOffice.includes(user.email) ) {
                availableUsers.push(user);
            }
        });
    });


    await Chore.find({ deleted: false }, ( err, ch ) => {
        if (err) {
            console.log(util.inspect(err));
            return 400;
        }

        ch = ch.filter( c => c.frequency.includes(new Date().getDay()) ).sort( (a, c) => c.difficulty - a.difficulty );

        currentChores = ch;
    });

    currentChores.forEach( async (chore) => {
        let assignedUser = availableUsers.find( (u) => !u.assignedTask );

        assignedUser.assignedTask = true;

        await User.findByIdAndUpdate(assignedUser._id, {assignedTaskId: chore.id, assignedTask: true}, { new: true }, (err, user) => {
            if (err) {
                console.log(err);
                return 400;
            }
            // bot.getChannel('chorebot').then(c => {
            //     bot.postMessageToChannel(c.name, `${user.name} has been assigned ${chore.title}.`, params, function(data) {
            //         console.log(data);
            //     });
            // });
        })
    });
}