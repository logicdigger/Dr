import app, { PORT } from "./app.js";

app.listen(PORT, () => {
  console.log(`Doctor directory API running on http://localhost:${PORT}`);
});
