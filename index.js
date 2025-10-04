require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

// --- Configuration ---
const {
    DISCORD_TOKEN,
    CHANNEL_ID,
    ERROR_CHANNEL_ID,
    BATTLEMETRICS_SERVER_ID
} = process.env;

const UPDATE_INTERVAL = 60 * 1000; // 1 minute
const API_URL = `https://api.battlemetrics.com/servers/${BATTLEMETRICS_SERVER_ID}`;

// --- Discord Client Setup ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// --- State ---
let lastPlayerList = new Set();
let lastMessageId = null;
let serverIsOnline = true;

// --- Fetch BattleMetrics Data ---
async function fetchServerData() {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`BattleMetrics API returned ${res.status}`);
    const data = await res.json();

    const server = data.data.attributes;
    const players = server.players || [];
    return {
        name: server.name,
        map: server.details.map || "Unknown",
        playerCount: server.players.length,
        maxPlayers: server.maxPlayers,
        players: players.map(p => p.name).filter(Boolean),
        status: server.status,
    };
}

// --- Main Logic ---
async function updateServerStatus() {
    try {
        const serverData = await fetchServerData();

        const currentPlayerList = new Set(serverData.players);

        // Detect joined/left
        const joinedPlayers = [...currentPlayerList].filter(p => !lastPlayerList.has(p));
        const leftPlayers = [...lastPlayerList].filter(p => !currentPlayerList.has(p));

        const embed = createServerEmbed(serverData, joinedPlayers, leftPlayers);

        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.error(`Error: Channel with ID ${CHANNEL_ID} not found.`);
            return;
        }

        if (lastMessageId) {
            try {
                const lastMessage = await channel.messages.fetch(lastMessageId);
                await lastMessage.edit({ embeds: [embed] });
            } catch (error) {
                if (error.code === 10008) {
                    const newMessage = await channel.send({ embeds: [embed] });
                    lastMessageId = newMessage.id;
                } else {
                    throw error;
                }
            }
        } else {
            const newMessage = await channel.send({ embeds: [embed] });
            lastMessageId = newMessage.id;
        }

        lastPlayerList = currentPlayerList;
        serverIsOnline = serverData.status === "online";

    } catch (error) {
        console.error("Error fetching from BattleMetrics API:", error);
        if (serverIsOnline) {
            serverIsOnline = false;
            lastMessageId = null;
            await sendStatusUpdate("🔴 Server Offline", "BattleMetrics API reports the server as offline or unreachable.");
        }
    }
}

// --- Embed Builder ---
function createServerEmbed(serverData, joinedPlayers, leftPlayers) {
    const embed = new EmbedBuilder()
        .setColor(serverData.status === "online" ? "#1ABC9C" : "#E74C3C")
        .setTitle(`${serverData.name}`)
        .addFields(
            { name: "🗺️ Map", value: `\`${serverData.map}\``, inline: true },
            { name: "👥 Players", value: `\`${serverData.playerCount} / ${serverData.maxPlayers}\``, inline: true },
            { name: "📡 Status", value: `\`${serverData.status}\``, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: "ARK Monitor Bot (BattleMetrics API)" });

    let activityDescription = "";
    if (joinedPlayers.length > 0) {
        activityDescription += `**🟢 Joined:**\n${joinedPlayers.map(p => `\`${p}\``).join("\n")}\n\n`;
    }
    if (leftPlayers.length > 0) {
        activityDescription += `**🔴 Left:**\n${leftPlayers.map(p => `\`${p}\``).join("\n")}`;
    }

    if (activityDescription) {
        embed.addFields({ name: "Player Activity", value: activityDescription });
    } else {
        embed.addFields({ name: "Player Activity", value: "No player changes since last update." });
    }

    return embed;
}

// --- Status Update Embed ---
async function sendStatusUpdate(title, description) {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(title.includes("Online") ? "#1ABC9C" : "#E74C3C")
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    if (lastMessageId) {
        try {
            const lastMessage = await channel.messages.fetch(lastMessageId);
            await lastMessage.delete();
        } catch (e) {}
        lastMessageId = null;
    }

    await channel.send({ embeds: [embed] });
}

// --- Error Handler ---
async function handleError(error) {
    if (!ERROR_CHANNEL_ID || ERROR_CHANNEL_ID === CHANNEL_ID) return;
    const errorChannel = await client.channels.fetch(ERROR_CHANNEL_ID);
    if (!errorChannel) return;

    const errorEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("Bot Error")
        .setDescription("An error occurred while updating server status.")
        .addFields({ name: "Error Message", value: `\`\`\`${error.message}\`\`\`` })
        .setTimestamp();

    await errorChannel.send({ embeds: [errorEmbed] });
}

// --- Discord Events ---
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📡 Monitoring BattleMetrics server ID: ${BATTLEMETRICS_SERVER_ID}`);
    updateServerStatus();
    setInterval(updateServerStatus, UPDATE_INTERVAL);
});

client.login(DISCORD_TOKEN);
