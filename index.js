// Matrix Bot by Hammer1279
// Matrix: @hammer1279:ht-dev.de | #general:ht-dev.de
// https://matrix.to/#/@hammer1279:ht-dev.de
// https://matrix.to/#/#general:ht-dev.de

import { MatrixAuth, MatrixClient, SimpleFsStorageProvider, AutojoinRoomsMixin, AutojoinUpgradedRoomsMixin, RustSdkCryptoStorageProvider } from "matrix-bot-sdk";
import { existsSync } from "node:fs";
import { writeFile, readFile, appendFile } from "node:fs/promises";
import { inspect } from "node:util";

import config from "./config.json" with {
    type: "json"
}

const { homeserver, deviceId, userId, password, registerToken, leaveOnStart } = config;

let token;

if (!existsSync("./token.txt")) {
    // This will be the URL where clients can reach your homeserver. Note that this might be different
    // from where the web/chat interface is hosted. The server must support password registration without
    // captcha or terms of service (public servers typically won't work).
    const auth = new MatrixAuth(homeserver);
    const loginClient = await auth.passwordLogin(userId.replace('@','').replace(/:.*/,''), password, deviceId);
    await writeFile("./token.txt", loginClient.accessToken);
    token = loginClient.accessToken;
} else {
    token = (await readFile("./token.txt")).toString();
}

// In order to make sure the bot doesn't lose its state between restarts, we'll give it a place to cache
// any information it needs to. You can implement your own storage provider if you like, but a JSON file
// will work fine for this example.
const storageProvider = new SimpleFsStorageProvider("storage.json");
const cryptoProvider = new RustSdkCryptoStorageProvider("./crypto");

// Finally, let's create the client and set it to autojoin rooms. Autojoining is typical of bots to ensure
// they can be easily added to any room.
const client = new MatrixClient(homeserver, token, storageProvider, cryptoProvider);
AutojoinRoomsMixin.setupOnClient(client);
AutojoinUpgradedRoomsMixin.setupOnClient(client);


// Before we start the bot, register our command handler
client.on("room.message", handleCommand);

// Now that everything is set up, start the bot. This will start the sync loop and run until killed.
client.start().then(() => console.log("Bot started!"));

// This is the command handler we registered a few lines up
async function handleCommand(roomId, event) {
    // Don't handle unhelpful events (ones that aren't text messages, are redacted, or sent by us)
    if (event['content']?.['msgtype'] !== 'm.text') return;
    if (event['sender'] === await client.getUserId()) return;
    
    // Check to ensure that the `!hello` command is being run
    const body = event['content']['body'];
    if (!body?.startsWith("!hello")) return;
    
    // Now that we've passed all the checks, we can actually act upon the command
    // await client.replyNotice(roomId, event, "Hello world!");
    await client.sendText(roomId, "Hewwo :3");
    console.log(inspect(event, false, null, true));
}