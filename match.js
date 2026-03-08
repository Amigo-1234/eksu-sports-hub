const params = new URLSearchParams(window.location.search);

const home = params.get("home");
const away = params.get("away");
const hs = params.get("hs");
const as = params.get("as");

document.getElementById("homeTeam").innerText = home;
document.getElementById("awayTeam").innerText = away;

document.getElementById("score").innerText = `${hs} - ${as}`;

document.getElementById("competition").innerText = "Inter Department Match";

document.getElementById("matchTime").innerText = "16:00";

const tabs = document.querySelectorAll(".tab");

const panels = document.querySelectorAll(".tab-panel");

tabs.forEach(tab => {

tab.addEventListener("click", () => {

tabs.forEach(t => t.classList.remove("active"));

panels.forEach(p => p.classList.remove("active"));

tab.classList.add("active");

document.getElementById(tab.dataset.tab).classList.add("active");

});

});