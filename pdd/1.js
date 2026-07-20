async function async1() {
  console.log("A");
  await async2();
  console.log("B");
}

async function async2() {
  console.log("C");
  throw new Error("D")
}

console.log("E");

async1().catch(() => {
  console.log("F");
})

console.log("G");

// E A C G F
