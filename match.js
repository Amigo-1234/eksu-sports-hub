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

/* MATCH STATUS SYSTEM */

const matchStatus = "live"; 
let matchMinute = 63;

const statusBadge = document.querySelector(".status-badge");
const timeDisplay = document.getElementById("matchTime");


if(matchStatus === "live"){

statusBadge.textContent = "LIVE";
statusBadge.className = "status-badge live";

timeDisplay.textContent = matchMinute + "'";

setInterval(()=>{

matchMinute++;

timeDisplay.textContent = matchMinute + "'";

},60000);

}

else if(matchStatus === "finished"){

statusBadge.textContent = "FT";
statusBadge.className = "status-badge finished";

timeDisplay.textContent = "";

}

else{

statusBadge.textContent = "Scheduled";
statusBadge.className = "status-badge scheduled";

timeDisplay.textContent = "16:00";

}

const events = [

{
minute:21,
type:"goal",
player:"Taiwo",
team:"Engineering"
},

{
minute:33,
type:"yellow",
player:"Malik",
team:"Agric"
},

{
minute:60,
type:"sub",
player:"Substitution",
team:"Engineering"
}

];

const eventsList = document.getElementById("eventsList");

events.forEach(event=>{

let icon = "⚽";
let className = "";

if(event.type === "goal"){
icon = "⚽";
className = "goal-event";
}

if(event.type === "yellow"){
icon = "🟨";
}

if(event.type === "sub"){
icon = "🔁";
}

eventsList.innerHTML += `
<div class="event-row ${className}">
<span class="minute">${event.minute}'</span>
<span class="event-icon ${event.type}">${icon}</span>
<span class="event-player">${event.player}</span>
<span class="event-team">${event.team}</span>
</div>
`;

});