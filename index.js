const SlackBot = require('slackbots');
const util = require('util');

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