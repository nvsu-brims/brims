"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const FAQS = [
  {
    question: "Who can use NVSU-BRIMS?",
    answer:
      "Anyone can freely browse the catalog without signing in. Student representatives of their respective organizations can sign up for a borrower account, then sign in to submit and manage borrow requests on behalf of their organization.",
  },
  {
    question: "Do I need to sign in to view the catalog?",
    answer:
      "No. The catalog is publicly viewable. You only need to sign in when you're ready to submit a borrow request.",
  },
  {
    question: "How do I create a borrower account?",
    answer:
      "Click Sign Up in the navigation bar and fill out the sign-up form with your details and your organization's information. Your account will be reviewed by an admin, and you'll be able to sign in once it's approved.",
  },
  {
    question: "How do I borrow an item?",
    answer:
      "As a student representative, sign in to your borrower account, browse the catalog, and submit a request for the item or equipment your organization needs. You'll receive an email at the address on your account once it's approved or declined, and you can always check the status of your request on your dashboard.",
  },
  {
    question: "What happens after my borrow request is approved?",
    answer:
      "Once your request is approved, you will receive instructions regarding the pickup or release of the requested item. Please follow the provided instructions and return the item in good condition on or before the specified due date.",
  },
  {
    question: "How long can I borrow an item?",
    answer:
      "The borrowing period depends on the type of item and the policies of the office managing NVSU-BRIMS. Please check your approved borrow request for the specific return date and make sure the item is returned on or before the due date.",
  },
  {
    question: "Where are you located?",
    answer:
      "The NVSU-BRIMS office is located along Quezon Street in Bayombong, Nueva Vizcaya, Philippines.",
  },
  {
    question: "Still have questions?",
    answer:
      "If you still have questions or need further assistance, please feel free to contact us at brims@nvsu.edu.ph or call (078) 321-2027. Our team will be happy to assist you with any additional concerns or inquiries.",
  },
] as const;

export default function FaqsPage() {
  // Single-open accordion, same behavior as index.php's Bootstrap
  // collapse (data-bs-parent keeps only one panel open at a time).
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-5">
      <div className="mb-4 text-center">
        <h2 className="mb-1 text-2xl font-bold text-green-700">
          Frequently Asked Questions
        </h2>
        <p className="mb-0 text-muted-foreground">
          Answers to common questions about borrowing, returning, and using
          NVSU-BRIMS.
        </p>
      </div>

      <div className="mx-auto mb-12 max-w-4xl">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          const isLast = index === FAQS.length - 1;

          return (
            <div key={faq.question} className={cn(!isLast && "border-b")}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 py-3 text-left font-semibold text-green-700 hover:text-green-800"
              >
                <span>{faq.question}</span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-green-700 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid overflow-hidden transition-all duration-200 ease-in-out",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <p className="pb-3 text-muted-foreground">{faq.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}