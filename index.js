// index.js
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const BATTLEMETRICS_ID = process.env.BATTLEMETRICS_ID; // ID del servidor en BattleMetrics
const CHANNEL_ID = process.env.CHANNEL_ID; // Canal de Discord donde se mostrará el estado

// Función para consultar el estado del servidor desde BattleMetrics
async function fetchServerData() {
  try {
    const response = await fetch(`https://api.battlemetrics.com/servers/${BATTLEMETRICS_ID}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const attributes = data.data.attributes;

    return {
      name: attributes.name,
      players: attributes.players,
      maxPlayers: attributes.maxPlayers,
      status: attributes.status,
      details: attributes.details,
    };
  } catch (error) {
    console.error("❌ Error fetching from BattleMetrics API:", error);
    return null;
  }
}

// Función para actualizar el estado en Discord
async function updateServerStatus() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const serverData = await fetchServerData();

  if (!serverData) {
    await channel.send("⚠️ No se pudo obtener información del servidor desde BattleMetrics.");
    return;
  }

  const color = serverData.status === "online" ? 0x00ff00 : 0xff0000;

  const embed = new EmbedBuilder()
    .setTitle(`📡 Estado del servidor: ${serverData.name}`)
    .setColor(color)
    .addFields(
      { name: "Estado", value: serverData.status.toUpperCase(), inline: true },
      { name: "Jugadores", value: `${serverData.players}/${serverData.maxPlayers}`, inline: true },
      { name: "Última actualización", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
    )
    .setFooter({ text: "Datos proporcionados por BattleMetrics" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

// Evento principal del bot
client.once("clientReady", async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  console.log(`📡 Monitoring BattleMetrics server ID: ${BATTLEMETRICS_ID}`);

  await updateServerStatus(); // Primera ejecución inmediata

  // Repite cada 60 segundos
  setInterval(updateServerStatus, 60 * 1000);
});

// Manejo de errores globales
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

client.login(process.env.DISCORD_TOKEN);
