let aiReply = "Here is your official pre-race taper plan:";
console.log(aiReply.replace(/[^.!?\n]*:\s*$/i, "").trim());

aiReply = "You are going to do amazing.\n\nHere is your official pre-race taper plan:";
console.log(aiReply.replace(/[^.!?\n]*:\s*$/i, "").trim());

aiReply = "Some text. And here is the plan:";
console.log(aiReply.replace(/[^.!?\n]*:\s*$/i, "").trim());
