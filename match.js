const params = new URLSearchParams(window.location.search);

const home = params.get("home");
const away = params.get("away");
const hs = params.get("hs");
const as = params.get("as");

document.getElementById("matchTitle").innerText = `${home} vs ${away}`;

document.getElementById("homeTeam").innerText = home;

document.getElementById("awayTeam").innerText = away;

document.getElementById("score").innerText = `${hs} - ${as}`;