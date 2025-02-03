"use client";

import * as React from "react";
import { Command as CmdkCommand } from "cmdk";
// If you have a utility function for classnames (commonly called `cn`), import it;
// otherwise, you can simply pass the className directly.
import { cn } from "@/lib/utils"; // Remove or adjust if you don't have this utility

const Command = React.forwardRef<
  React.ElementRef<typeof CmdkCommand>,
  React.ComponentPropsWithoutRef<typeof CmdkCommand>
>(({ className, ...props }, ref) => (
  <CmdkCommand
    ref={ref}
    className={typeof cn === "function" ? cn(className) : className}
    {...props}
  />
));

Command.displayName = "Command";

export { Command };