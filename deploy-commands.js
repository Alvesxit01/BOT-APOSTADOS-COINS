require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("coins")
    .setDescription("Sistema de coins (simbólico)")
    .addSubcommand((s) => s.setName("saldo").setDescription("Ver seu saldo"))
    .addSubcommand((s) =>
      s.setName("add")
        .setDescription("Staff: adiciona coins a um usuário")
        .addUserOption((o) => o.setName("user").setDescription("Usuário").setRequired(true))
        .addIntegerOption((o) => o.setName("qtd").setDescription("Quantidade").setRequired(true).setMinValue(0))
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("match")
    .setDescription("Organiza partidas (coins simbólico)")
    .addSubcommand((s) =>
      s.setName("criar")
        .setDescription("Cria uma partida")
        .addStringOption((o) => o.setName("modo").setDescription("Ex: X1, 4x4").setRequired(true))
        .addIntegerOption((o) => o.setName("max").setDescription("2 (x1) / 8 (4x4)").setRequired(true).setMinValue(2))
        .addIntegerOption((o) =>
          o.setName("valor").setDescription("Valor em coins (simbólico)").setRequired(true).setMinValue(0)
        )
    )
    .addSubcommand((s) =>
      s.setName("valor")
        .setDescription("Edita o valor em coins da sala (antes de iniciar)")
        .addStringOption((o) => o.setName("id").setDescription("ID da partida").setRequired(true))
        .addIntegerOption((o) => o.setName("valor").setDescription("Novo valor").setRequired(true).setMinValue(0))
    )
    .addSubcommand((s) =>
      s.setName("entrar")
        .setDescription("Entra numa partida")
        .addStringOption((o) => o.setName("id").setDescription("ID da partida").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("fechar")
        .setDescription("Fecha a partida (não entra mais ninguém)")
        .addStringOption((o) => o.setName("id").setDescription("ID da partida").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("resultado")
        .setDescription("Registra resultado e paga coins (simbólico)")
        .addStringOption((o) => o.setName("id").setDescription("ID da partida").setRequired(true))
        .addUserOption((o) => o.setName("vencedor").setDescription("Quem ganhou").setRequired(true))
        .addUserOption((o) => o.setName("perdedor").setDescription("Quem perdeu").setRequired(true))
    )
    .addSubcommand((s) => s.setName("rank").setDescription("Top 10 ELO"))
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🌍 Registrando comandos GLOBAIS...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ Comandos globais registrados!");
  } catch (err) {
    console.error("❌ Erro registrando comandos:", err);
  }
})();
