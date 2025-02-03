"use client";

import * as React from "react";
import { Command as CmdkCommand } from "cmdk";
import { cn } from "@/lib/utils"; // Optional: if you have a classnames utility

// Using 'any' for the element ref type to work around type conflicts between 
// cmdk's own React types and your project's React types.
const Command = React.forwardRef<
  any,
  React.ComponentPropsWithoutRef<typeof CmdkCommand>
>(({ className, ...props }, ref) => (
  <CmdkCommand ref={ref} className={cn ? cn(className) : className} {...props} />
));
Command.displayName = "Command";

export { Command };