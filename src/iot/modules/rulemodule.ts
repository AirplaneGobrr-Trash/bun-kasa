import { IotModule, merge } from "../iotmodule.ts";

/** Action to perform when a rule fires. */
export enum RuleAction {
  Disabled = -1,
  TurnOff = 0,
  TurnOn = 1,
  Unknown = 2,
}

/** Time option describing when a rule action executes. */
export enum RuleTimeOption {
  Disabled = -1,
  Enabled = 0,
  AtSunrise = 1,
  AtSunset = 2,
}

/** Representation of a schedule/antitheft/countdown rule. */
export interface Rule {
  id: string;
  name: string;
  enable: number;
  wday: number[];
  repeat: number;
  sact?: RuleAction;
  stimeOpt?: RuleTimeOption;
  smin?: number;
  eact?: RuleAction;
  etimeOpt?: RuleTimeOption;
  emin?: number;
  /** Only present on bulbs. */
  sLight?: Record<string, unknown>;
}

function parseRule(raw: Record<string, unknown>): Rule {
  return {
    id: raw.id as string,
    name: raw.name as string,
    enable: raw.enable as number,
    wday: raw.wday as number[],
    repeat: raw.repeat as number,
    sact: raw.sact as RuleAction | undefined,
    stimeOpt: raw.stime_opt as RuleTimeOption | undefined,
    smin: raw.smin as number | undefined,
    eact: raw.eact as RuleAction | undefined,
    etimeOpt: raw.etime_opt as RuleTimeOption | undefined,
    emin: raw.emin as number | undefined,
    sLight: raw.s_light as Record<string, unknown> | undefined,
  };
}

/** Base class for rule-based modules, such as countdown, schedule, and antitheft. */
export class RuleModule extends IotModule {
  override query(): Record<string, unknown> {
    const q = this.queryForCommand("get_rules");
    return merge(q, this.queryForCommand("get_next_action"));
  }

  get rules(): Rule[] {
    try {
      const ruleList = (this.data.get_rules as { rule_list: Record<string, unknown>[] })
        .rule_list;
      return ruleList.map(parseRule);
    } catch {
      return [];
    }
  }

  async setEnabled(state: boolean): Promise<Record<string, unknown>> {
    return this.call("set_overall_enable", { enable: state });
  }

  async deleteRule(rule: Rule): Promise<Record<string, unknown>> {
    return this.call("delete_rule", { id: rule.id });
  }

  async deleteAllRules(): Promise<Record<string, unknown>> {
    return this.call("delete_all_rules");
  }
}
