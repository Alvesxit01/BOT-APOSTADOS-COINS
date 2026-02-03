require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

// =====================
// Dados em memória (MVP)
// =====================
const matches = new Map(); // id -> {ownerId, players:Set, status, modo, maxPlayers, valor, channelId}
const elo = new Map(); // userId -> number
const coins = new Map(); // userId -> number

function getCoins(uid) {
  if (!coins.has(uid)) coins.set(uid, 0);
  return coins.get(uid);
}
function addCoins(uid, qtd) {
  coins.set(uid, getCoins(uid) + qtd);
}
function subCoins(uid, qtd) {
  coins.set(uid, Math.max(0, getCoins(uid) - qtd));
}

function getElo(uid) {
  if (!elo.has(uid)) elo.set(uid, 1000);
  return elo.get(uid);
}
function updateElo(winnerId, loserId, k = 24) {
  const w = getElo(winnerId);
  const l = getElo(loserId);
  const expW = 1 / (1 + Math.pow(10, (l - w) / 400));
  const expL = 1 - expW;
  elo.set(winnerId, Math.round(w + k * (1 - expW)));
  elo.set(loserId, Math.round(l + k * (0 - expL)));
}

function newMatchId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function isStaff(member) {
  const staffRoleId = process.env.STAFF_ROLE_ID;
  if (!staffRoleId) return false;
  return member.roles.cache.has(staffRoleId);
}

client.once("ready", () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ======================
  // /coins
  // ======================
  if (interaction.commandName === "coins") {
    const sub = interaction.options.getSubcommand();

    if (sub === "saldo") {
      return interaction.reply({
        content: `🪙 Seu saldo: **${getCoins(interaction.user.id)}** coins`,
        ephemeral: true,
      });
    }

    if (sub === "add") {
      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: "🚫 Só STAFF pode usar esse comando.",
          ephemeral: true,
        });
      }

      const user = interaction.options.getUser("user", true);
      const qtd = interaction.options.getInteger("qtd", true);

      addCoins(user.id, qtd);

      return interaction.reply({
        content: `✅ Adicionado **${qtd}** coins para <@${user.id}>. Saldo: **${getCoins(user.id)}**`,
      });
    }
  }

  // ======================
  // /match
  // ======================
  if (interaction.commandName === "match") {
    const sub = interaction.options.getSubcommand();

    // /match criar
    if (sub === "criar") {
      const modo = interaction.options.getString("modo", true);
      const maxPlayers = interaction.options.getInteger("max", true);
      const valor = interaction.options.getInteger("valor", true);

      const id = newMatchId();
      const ownerId = interaction.user.id;

      matches.set(id, {
        ownerId,
        players: new Set([ownerId]),
        status: "ABERTO",
        modo,
        maxPlayers,
        valor,
        channelId: null,
      });

      return interaction.reply({
        content:
          `🎮 **Partida criada**: \`${id}\`\n` +
          `Modo: **${modo}** | Vagas: **${maxPlayers}** | Valor: **${valor}** coins\n` +
          `Entre com: **/match entrar id:${id}**`,
      });
    }

    // /match valor
    if (sub === "valor") {
      const id = interaction.options.getString("id", true).toUpperCase();
      const novo = interaction.options.getInteger("valor", true);

      const m = matches.get(id);
      if (!m) return interaction.reply({ content: "❌ ID não encontrado.", ephemeral: true });

      if (interaction.user.id !== m.ownerId && !isStaff(interaction.member)) {
        return interaction.reply({ content: "🚫 Só o dono ou STAFF pode editar.", ephemeral: true });
      }

      if (m.status !== "ABERTO") {
        return interaction.reply({ content: "⚠️ Só dá pra editar antes de iniciar.", ephemeral: true });
      }

      m.valor = novo;
      return interaction.reply({ content: `💰 Valor da partida \`${id}\` agora é **${novo}** coins.` });
    }

    // /match entrar
    if (sub === "entrar") {
      const id = interaction.options.getString("id", true).toUpperCase();
      const m = matches.get(id);

      if (!m) return interaction.reply({ content: "❌ ID não encontrado.", ephemeral: true });
      if (m.status !== "ABERTO") return interaction.reply({ content: "⚠️ Essa partida não está aberta.", ephemeral: true });
      if (m.players.has(interaction.user.id)) return interaction.reply({ content: "Você já está nela.", ephemeral: true });
      if (m.players.size >= m.maxPlayers) return interaction.reply({ content: "🚫 Partida lotada.", ephemeral: true });

      // paga coins simbólico para entrar
      if (getCoins(interaction.user.id) < m.valor) {
        return interaction.reply({
          content: `💸 Você precisa de **${m.valor}** coins. Seu saldo: **${getCoins(interaction.user.id)}**`,
          ephemeral: true,
        });
      }

      subCoins(interaction.user.id, m.valor);
      m.players.add(interaction.user.id);

      // completou: cria canal privado
      if (m.players.size === m.maxPlayers) {
        m.status = "EM_ANDAMENTO";
        const guild = interaction.guild;

        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
        ];

        for (const uid of m.players) {
          overwrites.push({
            id: uid,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          });
        }

        // staff pode ver canal
        if (process.env.STAFF_ROLE_ID) {
          overwrites.push({
            id: process.env.STAFF_ROLE_ID,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
          });
        }

        const ch = await guild.channels.create({
          name: `partida-${id.toLowerCase()}`,
          type: ChannelType.GuildText,
          permissionOverwrites: overwrites,
        });

        m.channelId = ch.id;

        const mentions = [...m.players].map((x) => `<@${x}>`).join(" ");
        const pot = m.valor * m.maxPlayers;

        await ch.send(
          `✅ **Partida ${id}** iniciada!\n` +
            `Modo: **${m.modo}** | Valor: **${m.valor}** coins por player | Pot: **${pot}** coins\n` +
            `Jogadores: ${mentions}\n\n` +
            `Quando acabar use:\n` +
            `**/match resultado id:${id} vencedor:@user perdedor:@user**`
        );

        return interaction.reply({
          content: `✅ Entrou! Sala completa — canal criado: <#${ch.id}>`,
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `✅ Você entrou em \`${id}\` e pagou **${m.valor}** coins. (${m.players.size}/${m.maxPlayers})`,
      });
    }

    // /match fechar
    if (sub === "fechar") {
      const id = interaction.options.getString("id", true).toUpperCase();
      const m = matches.get(id);

      if (!m) return interaction.reply({ content: "❌ ID não encontrado.", ephemeral: true });

      if (interaction.user.id !== m.ownerId && !isStaff(interaction.member)) {
        return interaction.reply({ content: "🚫 Só o dono ou STAFF pode fechar.", ephemeral: true });
      }

      if (m.status !== "ABERTO") {
        return interaction.reply({ content: "⚠️ Só dá pra fechar quando está aberto.", ephemeral: true });
      }

      m.status = "FECHADO";
      return interaction.reply({ content: `🔒 Partida \`${id}\` foi fechada.` });
    }

    // /match resultado
    if (sub === "resultado") {
      const id = interaction.options.getString("id", true).toUpperCase();
      const vencedor = interaction.options.getUser("vencedor", true);
      const perdedor = interaction.options.getUser("perdedor", true);

      const m = matches.get(id);
      if (!m) return interaction.reply({ content: "❌ ID não encontrado.", ephemeral: true });
      if (m.status === "FINALIZADO") return interaction.reply({ content: "⚠️ Essa partida já foi finalizada.", ephemeral: true });

      if (
        interaction.user.id !== m.ownerId &&
        !isStaff(interaction.member) &&
        !m.players.has(interaction.user.id)
      ) {
        return interaction.reply({ content: "🚫 Sem permissão.", ephemeral: true });
      }

      if (!m.players.has(vencedor.id) || !m.players.has(perdedor.id)) {
        return interaction.reply({ content: "⚠️ Vencedor/perdedor precisam estar na partida.", ephemeral: true });
      }

      m.status = "FINALIZADO";
      updateElo(vencedor.id, perdedor.id);

      // paga o pot todo pro vencedor
      const pot = m.valor * m.maxPlayers;
      addCoins(vencedor.id, pot);

      const msg =
        `🏁 **Resultado ${id}**\n` +
        `✅ Vencedor: <@${vencedor.id}> — ganhou **${pot}** coins | Saldo: **${getCoins(vencedor.id)}** | ELO: **${getElo(vencedor.id)}**\n` +
        `❌ Perdedor: <@${perdedor.id}> | ELO: **${getElo(perdedor.id)}**`;

      if (m.channelId) {
        const ch = await interaction.guild.channels.fetch(m.channelId).catch(() => null);
        if (ch) await ch.send(msg);
      }

      return interaction.reply({ content: msg });
    }

    // /match rank
    if (sub === "rank") {
      const top = [...elo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (!top.length) return interaction.reply({ content: "Ainda não há ranking.", ephemeral: true });

      const lines = top.map(([uid, score], i) => `${i + 1}. <@${uid}> — **${score}**`).join("\n");
      return interaction.reply({ content: `🏆 **Top 10 ELO**\n${lines}` });
    }
  }
});

// ======== Login ========
client.login(process.env.DISCORD_TOKEN);
