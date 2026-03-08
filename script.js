const matches = [

{
title:"Inter Department Match",
time:"16:00",
status:"scheduled",
home:"Engineering",
away:"Agric",
homeScore:1,
awayScore:0
},

{
title:"Inter Faculty Match",
time:"LIVE 45'",
status:"live",
home:"Chemistry",
away:"Theatre Arts",
homeScore:3,
awayScore:1
},

{
title:"Inter Department Match",
time:"FT",
status:"finished",
home:"Computer Science",
away:"Law",
homeScore:2,
awayScore:2
}

];

const container = document.getElementById("matches");

matches.forEach(match => {

const card = document.createElement("div");

card.className = "match-card";

card.innerHTML = `

<div class="match-header">

<div class="match-title">
<span class="match-icon">⚽</span>
${match.title}
</div>

<div class="match-time ${match.status}">
${match.time}
</div>

</div>

<div class="team-row">

<div class="team-left">
⚽ ${match.home}
</div>

<div class="team-score">
${match.homeScore}
</div>

</div>

<div class="team-row">

<div class="team-left">
⚽ ${match.away}
</div>

<div class="team-score">
${match.awayScore}
</div>

</div>

`;

container.appendChild(card);

card.addEventListener("click", () => {

window.location.href =
`match.html?home=${match.home}&away=${match.away}&hs=${match.homeScore}&as=${match.awayScore}`;

});

});



const hamburger = document.getElementById("hamburger");
const mobileMenu = document.getElementById("mobileMenu");

hamburger.addEventListener("click", () => {

hamburger.classList.toggle("active");

mobileMenu.classList.toggle("show");

});