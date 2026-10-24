import { redirect } from "next/navigation";

// Item 12: there is no blocking "Searching now" page. Old links go straight to the radar.
export default function Welcome() {
  redirect("/radar");
}
