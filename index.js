// Matrix Bot by Hammer1279
// Matrix: @hammer1279:ht-dev.de | #general:ht-dev.de
// https://matrix.to/#/@hammer1279:ht-dev.de
// https://matrix.to/#/#general:ht-dev.de

import { initAsync, Tracing, OlmMachine, UserId, LoggerLevel, DeviceId } from "@matrix-org/matrix-sdk-crypto-wasm";
import { AuthType, ClientEvent, createClient, GuestAccess, KnownMembership, RoomEvent, RoomMemberEvent } from "matrix-js-sdk";
import { existsSync } from "node:fs";
import { writeFile, readFile, appendFile } from "node:fs/promises";
import { inspect } from "node:util";

import config from "./config.json" with {
    type: "json"
}

const { homeserver, deviceId, userId, password, registerToken, leaveOnStart } = config;

let matrixClient;
let roomList = new Set();

async function loadCrypto(userId, deviceId) {
    // Do this before any other calls to the library
    await initAsync();

    // Optional: enable tracing in the rust-sdk
    new Tracing(LoggerLevel.Trace).turnOn();

    // Create a new OlmMachine
    //
    // The following will use an in-memory store. It is recommended to use
    // indexedDB where that is available.
    // See https://matrix-org.github.io/matrix-rust-sdk-crypto-wasm/classes/OlmMachine.html#initialize
    // const olmMachine = await OlmMachine.initialize(new UserId(userId), new DeviceId(deviceId), "MyStore", "MySuperSecretKey");
    const olmMachine = await OlmMachine.initialize(new UserId(userId), new DeviceId(deviceId));

    return olmMachine;
}

await loadCrypto(userId, deviceId);

if (!existsSync("./token.txt")) {
    matrixClient = createClient({ baseUrl: homeserver, userId: userId, deviceId: deviceId, timelineSupport: true });
    matrixClient.login(AuthType.Password, {"user": userId, "password": password}).then(async (response) => {
        await writeFile("./token.txt", response.access_token);
    });
} else {
    // matrixClient.loginWithToken((await readFile("./token.txt")).toString());
    matrixClient = createClient({ baseUrl: homeserver, userId: userId, accessToken: (await readFile("./token.txt")).toString(), deviceId: deviceId, timelineSupport: true });
}

// i cannot get this to work with a indexed db so this is false
await matrixClient.initRustCrypto({useIndexedDB: false});

appendFile("./client.log", `${new Date().toISOString()} | Started!\n`);

// attempt at automating registers, this might get used in a service for only allowing registers of certain users via prior oauth2 auth

// if (await matrixClient.isUsernameAvailable("demo123")) {
//     matrixClient.register("demo123", "test123", undefined, {
//         type: AuthType.Dummy
//     }, undefined, undefined, true).then(() => console.log("gud"), reject => {
//         const session = reject.data.session;
//         matrixClient.register("demo123", "test123", session, {
//             type: AuthType.RegistrationToken,
//             token: registerToken,
//             session: session,
//         }, undefined, undefined, true)
//     });
// } else {
//     console.log("Username taken");
// }

matrixClient.on(RoomEvent.MyMembership, function (room, membership, prevMembership) {
    if (membership === KnownMembership.Invite) {
        matrixClient.joinRoom(room.roomId).then(function () {
            console.log("Auto-joined %s", room.roomId);
            roomList.add(room.roomId);
            appendFile("./client.log", `${new Date().toISOString()} | Joined ${room.roomId}\n`);
        });
    }
});

// // Listen for low-level MatrixEvents
matrixClient.on(ClientEvent.Event, function (event) {
    console.log(event.getType());
});

matrixClient.on(RoomMemberEvent.Membership, function (event, member) {
    // appendFile("./client.log", `${new Date().toISOString()} | Membership Event: ${inspect(event)}\n`);
    // appendFile("./client.log", `${new Date().toISOString()} | Membership Member: ${inspect(member)}\n`);
    if (event.event.sender == userId && event.event.content.membership == KnownMembership.Join) {
        roomList.add(event.event.room_id);
        appendFile("./client.log", `${new Date().toISOString()} | I'm in?: ${event.event.room_id}\n`);
    }
    console.log(inspect(event), inspect(member))
})

// Listen for typing changes
matrixClient.on(RoomMemberEvent.Typing, function (event, member) {
    if (member.typing) {
        console.log(member.name + " is typing...");
    } else {
        console.log(member.name + " stopped typing.");
    }
});

matrixClient.on(RoomEvent.Timeline, async function (event, room, toStartOfTimeline) {
    if (toStartOfTimeline) {
        return; // don't print paginated results
    }
    // if (event.getType() !== "m.room.message") {
    //     return; // only print messages
    // }
    // console.log(
    //     // the room name will update with m.room.name events automatically
    //     "(%s) %s :: %s",
    //     room.name,
    //     event.getSender(),
    //     event.getContent().body,
    // );
    // matrixClient.sendMessage(event.getRoomId(), "Hello")
    let body = '';
	try {
		if (event.getType() === 'm.room.encrypted') {
			const clearEvent = await matrixClient.getCrypto().decryptEvent(event);
			({ body } = clearEvent.clearEvent.content);
		} else {
			({ body } = event.getContent());
            appendFile("./client.log", `${new Date().toISOString()} | Message Event: ${event.getType()}\n`);
		}
		if (body) {
            // do something
            if (event.getSender() != userId) {
                if (new Date().getTime() - 10000 > event.getDate()) {
                    console.log("Ignoring old message:", body);
                    appendFile("./client.log", `${new Date().toISOString()} | Ignoring old message: ${body}\n`);
                    return;
                }
                console.log("MESSAGE:", body);
                if (body == "!help leave") {
                    leaveAllRooms();
                    appendFile("./client.log", `${new Date().toISOString()} | ${event.getSender()} told me to leave all rooms\n`);
                } else {
                    appendFile("./client.log", `${new Date().toISOString()} | Received Message: ${body}\n`);
                    matrixClient.sendTextMessage(event.getRoomId(), "Hewwo :3")
                }
            }
		}
	} catch (error) {
		console.error('#### ', error);
	}
});

matrixClient.getRooms().forEach(room => {
    appendFile("./client.log", `${new Date().toISOString()} | I'm in: ${inspect(room)}\n`);
})

if (leaveOnStart) {
    setTimeout(() => {
        leaveAllRooms();
    }, 1000);
}

function leaveRoom(roomId) {
    matrixClient.leave(roomId).then(val => {
        appendFile("./client.log", `${new Date().toISOString()} | Left ${roomId}\n`);
    }, () => {}) // do not give a shit if it failed
}

function leaveAllRooms() {
    roomList.forEach(leaveRoom);
}

matrixClient.startClient();
