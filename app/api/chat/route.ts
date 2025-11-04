import { NextRequest, NextResponse } from "next/server";
import { format, addDays, parse } from "date-fns";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Booking {
  id: string;
  name: string;
  email: string;
  seatNumber: string;
  date: string;
  time: string;
  duration: string;
  purpose: string;
}

const availableSeats = [
  "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10",
  "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10"
];

function extractBookingInfo(conversation: string): Partial<Booking> | null {
  const info: Partial<Booking> = {};

  // Extract name
  const nameMatch = conversation.match(/(?:name is|I'm|I am|my name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (nameMatch) info.name = nameMatch[1];

  // Extract email
  const emailMatch = conversation.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) info.email = emailMatch[1];

  // Extract date
  const dateMatch = conversation.match(/(?:on|for)\s+(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)?(?:\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?)/i);
  if (dateMatch) {
    const dateStr = dateMatch[1].toLowerCase();
    if (dateStr === "today") {
      info.date = format(new Date(), "yyyy-MM-dd");
    } else if (dateStr === "tomorrow") {
      info.date = format(addDays(new Date(), 1), "yyyy-MM-dd");
    } else {
      info.date = format(new Date(), "yyyy-MM-dd");
    }
  }

  // Extract time
  const timeMatch = conversation.match(/(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] || "00";
    const period = timeMatch[3]?.toLowerCase();

    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    info.time = `${hours.toString().padStart(2, "0")}:${minutes}`;
  }

  // Extract duration
  const durationMatch = conversation.match(/(?:for)\s+(\d+)\s*(hour|hr|minute|min)s?/i);
  if (durationMatch) {
    const amount = durationMatch[1];
    const unit = durationMatch[2].toLowerCase();
    info.duration = unit.startsWith("hour") || unit === "hr" ? `${amount} hours` : `${amount} minutes`;
  }

  // Extract purpose
  const purposeMatch = conversation.match(/(?:for|purpose:|reason:)\s+([a-z\s]+(?:meeting|interview|work|discussion|presentation))/i);
  if (purposeMatch) {
    info.purpose = purposeMatch[1].trim();
  }

  return Object.keys(info).length > 0 ? info : null;
}

function generateResponse(userMessage: string, bookings: Booking[], conversationHistory: Message[]): { message: string; booking?: Booking } {
  const lowerMessage = userMessage.toLowerCase();

  // Check availability query
  if (lowerMessage.includes("available") || lowerMessage.includes("availability") || lowerMessage.includes("free seat")) {
    const bookedSeats = bookings.map(b => b.seatNumber);
    const freeSeats = availableSeats.filter(seat => !bookedSeats.includes(seat));

    return {
      message: `We have ${freeSeats.length} seats available: ${freeSeats.slice(0, 10).join(", ")}${freeSeats.length > 10 ? "..." : ""}. Would you like to book one?`
    };
  }

  // Check for booking intent
  if (lowerMessage.includes("book") || lowerMessage.includes("reserve") || lowerMessage.includes("schedule")) {
    const fullConversation = conversationHistory.map(m => m.content).join(" ") + " " + userMessage;
    const bookingInfo = extractBookingInfo(fullConversation);

    const missingFields: string[] = [];
    if (!bookingInfo?.name) missingFields.push("name");
    if (!bookingInfo?.email) missingFields.push("email");
    if (!bookingInfo?.date) missingFields.push("date");
    if (!bookingInfo?.time) missingFields.push("time");

    if (missingFields.length > 0) {
      return {
        message: `I'd be happy to help you book a seat! I need a few more details:\n${
          !bookingInfo?.name ? "- Your full name\n" : ""
        }${
          !bookingInfo?.email ? "- Your email address\n" : ""
        }${
          !bookingInfo?.date ? "- Preferred date (e.g., today, tomorrow, or a specific date)\n" : ""
        }${
          !bookingInfo?.time ? "- Preferred time (e.g., 2:00 PM)\n" : ""
        }Could you provide these details?`
      };
    }

    // Create booking - at this point all fields are validated
    if (!bookingInfo) {
      return {
        message: "I couldn't extract booking information. Please try again with your details."
      };
    }

    const bookedSeats = bookings.map(b => b.seatNumber);
    const availableSeat = availableSeats.find(seat => !bookedSeats.includes(seat)) || "A1";

    const newBooking: Booking = {
      id: `BK${Date.now()}`,
      name: bookingInfo.name!,
      email: bookingInfo.email!,
      seatNumber: availableSeat,
      date: bookingInfo.date!,
      time: bookingInfo.time!,
      duration: bookingInfo.duration || "2 hours",
      purpose: bookingInfo.purpose || "General booking"
    };

    return {
      message: `Perfect! I've successfully booked seat ${newBooking.seatNumber} for you.\n\n📋 Booking Details:\n- Name: ${newBooking.name}\n- Email: ${newBooking.email}\n- Seat: ${newBooking.seatNumber}\n- Date: ${newBooking.date}\n- Time: ${newBooking.time}\n- Duration: ${newBooking.duration}\n\nA confirmation email will be sent to ${newBooking.email}. Is there anything else I can help you with?`,
      booking: newBooking
    };
  }

  // Check for cancel/modify intent
  if (lowerMessage.includes("cancel") || lowerMessage.includes("modify") || lowerMessage.includes("change")) {
    return {
      message: "I can help you cancel or modify your booking. Could you please provide your booking ID or email address?"
    };
  }

  // Check for view bookings
  if (lowerMessage.includes("my booking") || lowerMessage.includes("show booking") || lowerMessage.includes("view booking")) {
    if (bookings.length === 0) {
      return {
        message: "You don't have any active bookings at the moment. Would you like to book a seat?"
      };
    }
    return {
      message: `You have ${bookings.length} active booking(s). You can see them in the bookings panel on the right. Would you like to modify any of them?`
    };
  }

  // Help/general inquiry
  if (lowerMessage.includes("help") || lowerMessage.includes("how") || lowerMessage.includes("what can")) {
    return {
      message: "I can assist you with:\n\n✓ Booking a seat - Just tell me when you'd like to book\n✓ Checking seat availability\n✓ Viewing your bookings\n✓ Modifying or canceling bookings\n✓ Answering questions about our facilities\n\nOur seats are available from 9:00 AM to 6:00 PM, Monday through Friday. How can I help you today?"
    };
  }

  // Greeting
  if (lowerMessage.includes("hello") || lowerMessage.includes("hi") || lowerMessage.includes("hey")) {
    return {
      message: "Hello! Welcome to our AI Receptionist service. I'm here to help you book a seat or manage your schedule. What would you like to do today?"
    };
  }

  // Default response
  return {
    message: "I'm here to help you with seat bookings and scheduling. You can ask me to:\n- Book a seat\n- Check availability\n- View your bookings\n- Modify or cancel a reservation\n\nWhat would you like to do?"
  };
}

export async function POST(request: NextRequest) {
  try {
    const { messages, bookings } = await request.json();

    const userMessage = messages[messages.length - 1].content;
    const result = generateResponse(userMessage, bookings || [], messages.slice(0, -1));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error processing chat:", error);
    return NextResponse.json(
      { message: "I apologize, but I encountered an error. Please try again." },
      { status: 500 }
    );
  }
}
