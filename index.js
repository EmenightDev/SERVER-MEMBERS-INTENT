require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const query = require('steam-server-query');

// --- Configuration ---
const {
    DISCORD_TOKEN,
    CHANNEL_ID,
    ERROR_CHANNEL_ID,
    ARK_SERVER_IP,
    ARK_SERVER_PORT
} = process.env;
const UPDATE_INTERVAL = 60 * 1000; // 1 minute

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

// --- State ---
let lastPlayerList = new Set();
let lastMessageId = null;
let serverIsOnline = true;

// --- Main Logic ---
async function updateServerStatus() {
    try {
        const serverData = await query.info(ARK_SERVER_IP, parseInt(ARK_SERVER_PORT, 10), 5000);

        if (!serverIsOnline) {
            serverIsOnline = true;
            await sendStatusUpdate('🟢 Server is Back Online!', `The server at ${ARK_SERVER_IP}:${ARK_SERVER_PORT} is responsive again.`);
        }

        const currentPlayerList = new Set(serverData.players.map(p => p.name).filter(Boolean));

        const joinedPlayers = [...currentPlayerList].filter(player => !lastPlayerList.has(player));
        const leftPlayers = [...lastPlayerList].filter(player => !currentPlayerList.has(player));

        const embed = createServerEmbed(serverData, joinedPlayers, leftPlayers);
        
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.error(`Error: Channel with ID ${CHANNEL_ID} not found.`);
            return;
        }

        // Try to edit the last message, otherwise send a new one
        if (lastMessageId) {
            try {
                const lastMessage = await channel.messages.fetch(lastMessageId);
                await lastMessage.edit({ embeds: [embed] });
            } catch (error) {
                // If message was deleted, send a new one
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

    } catch (error) {
        console.error('Error querying server or updating Discord:', error);
        if (serverIsOnline) {
            serverIsOnline = false;
            // Clear last message ID so a new "offline" message is sent
            lastMessageId = null; 
            await sendStatusUpdate(`🔴 Server Offline`, `Server at ${ARK_SERVER_IP}:${ARK_SERVER_PORT} is not responding.`);
        }
        // Optionally report transient errors
        // await handleError(error);
    }
}

function createServerEmbed(serverData, joinedPlayers, leftPlayers) {
    const embed = new EmbedBuilder()
        .setColor('#1ABC9C')
        .setTitle(`${serverData.name}`)
        .setTimestamp()
        .setFooter({ text: 'ARK Monitor Bot' });

    embed.addFields(
        { name: '🗺️ Map', value: ```${serverData.map}```, inline: true },
        { name: '👥 Players', value: ```${serverData.players.length} / ${serverData.max_players}```, inline: true },
        { name: '⚙️ Version', value: ```${serverData.version}```, inline: true }
    );
    
    let activityDescription = '';
    if (joinedPlayers.length > 0) {
        activityDescription += `**🟢 Joined:**\n${joinedPlayers.map(p => `\`${p}\``).join('\n')}\n\n`;
    }
    if (leftPlayers.length > 0) {
        activityDescription += `**🔴 Left:**\n${leftPlayers.map(p => `\`${p}\``).join('\n')}`;
    }

    if (activityDescription) {
        embed.addFields({ name: 'Player Activity', value: activityDescription });
    } else {
        embed.addFields({ name: 'Player Activity', value: 'No player changes since last update.' });
    }

    return embed;
}

async function sendStatusUpdate(title, description) {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(title.includes('Online') ? '#1ABC9C' : '#E74C3C')
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
        
    if(lastMessageId) {
        try {
            const lastMessage = await channel.messages.fetch(lastMessageId);
            await lastMessage.delete();
        } catch(e) { /* ignore if fails */ }
        lastMessageId = null;
    }
    await channel.send({ embeds: [embed] });
}

async function handleError(error) {
    if (!ERROR_CHANNEL_ID || ERROR_CHANNEL_ID === CHANNEL_ID) return;
    const errorChannel = await client.channels.fetch(ERROR_CHANNEL_ID);
    if (!errorChannel) {
        console.error(`Error: Error channel with ID ${ERROR_CHANNEL_ID} not found.`);
        return;
    }

    const errorEmbed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('Bot Error')
        .setDescription('An error occurred while trying to update server status.')
        .addFields({ name: 'Error Message', value: ```${error.message}``` })
        .setTimestamp();

    await errorChannel.send({ embeds: [errorEmbed] });
}

// --- Discord Events ---
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Monitoring ARK server: ${ARK_SERVER_IP}:${ARK_SERVER_PORT}`);
    console.log(`Posting updates to channel ID: ${CHANNEL_ID}`);
    updateServerStatus(); // Initial update
    setInterval(updateServerStatus, UPDATE_INTERVAL);
});

client.login(DISCORD_TOKEN);
