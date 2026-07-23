import { useNavigate } from "@solidjs/router";
import CounterPanel from "../components/CounterPanel";

export default function Counter() {
  const navigate = useNavigate();
  return <CounterPanel onBack={() => navigate("/home")} />;
}
