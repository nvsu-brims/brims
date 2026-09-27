import { FilePlus2, Search, Undo2 } from "lucide-react";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

const ABOUT_CARDS = [
  {
    icon: Search,
    title: "Browse",
    text: "Explore available sports, arts, and general items and equipment by category.",
  },
  {
    icon: FilePlus2,
    title: "Request",
    text: "Submit a borrow request for the item you need, and track its approval status.",
  },
  {
    icon: Undo2,
    title: "Return",
    text: "Keep track of due dates and return items on time to keep the catalog available for others.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-5">
      <div className="mb-4">
        <h2 className="mb-1 text-2xl font-bold text-green-700">About Us</h2>
        <p className="mb-0 text-muted-foreground">
          Learn more about the NVSU Borrowing and Returning Items &amp;
          Equipment Management System.
        </p>
      </div>

      <Card className="mb-4 rounded-2xl !border-0 shadow-md">
        <CardContent className="p-4 md:p-5">
          <h3 className="mb-3 text-xl font-bold text-green-800">
            What is NVSU-BRIMS?
          </h3>
          <p className="mb-3 text-muted-foreground">
            NVSU-BRIMS is the official platform for borrowing and returning
            items and equipment from the Sports Development Office and the
            University Culture and the Arts Office — Nueva Vizcaya State
            University Borrowing and Returning Items &amp; Equipment
            Management System. It was built to replace scattered logbooks
            and walk-in requests with a single, organized system that both
            offices can rely on. Every item, from sports gear to performing
            arts equipment, is tracked here.
          </p>
          <p className="mb-0 text-muted-foreground">
            NVSU students and staff can browse the available inventory,
            submit a request to borrow an item, and track that request as
            it moves from pending to approved by office staff. Once
            approved, the system keeps a record of the due date so
            borrowers know exactly when to return the item, and staff can
            monitor approvals, due dates, and returns from the same
            dashboard — all without anyone needing to visit each office in
            person just to check availability.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ABOUT_CARDS.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="h-full rounded-2xl !border-0 shadow-md">
            <CardContent className="flex flex-row items-start gap-3 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
                <Icon className="size-5" />
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="mb-0 text-sm text-muted-foreground">{text}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}