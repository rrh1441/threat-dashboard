/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { Command as CmdkCommand } from "cmdk";

export const Command = React.forwardRef<any, any>((props, ref) => {
  return <CmdkCommand ref={ref} {...props} />;
});

Command.displayName = "Command";
/* eslint-enable @typescript-eslint/no-explicit-any */