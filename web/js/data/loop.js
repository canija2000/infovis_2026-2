export async function loadLoop() {
  const response = await fetch("data/loop.json?v=2");
  if (!response.ok) throw new Error(`loop.json: ${response.status}`);
  return response.json();
}
