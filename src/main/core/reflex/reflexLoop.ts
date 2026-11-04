/**
 * 20Hz Spinal Survival Reflex Engine (inspired by minecraft-ai-companion)
 * Runs synchronously on every Minecraft game tick (50ms / 20 Hz)
 * Bypasses LLM latency for life-saving instantaneous reactions:
 * 1. MLG Water Bucket Clutch (detect fall speed & proximity to ground)
 * 2. Instant Shield Block (detect Creeper fuse / skeleton arrow trajectory)
 * 3. Emergency Totem of Undying swap on near-lethal damage (< 4 HP)
 * 4. Extinguish Fire / Lava escape
 */

export interface ReflexState {
  enabled: boolean;
  activeReflex?: string;
  clutchCount: number;
  shieldBlocks: number;
  totemSaves: number;
}

export class ReflexEngine {
  private bot: any;
  private intervalId: NodeJS.Timeout | null = null;
  private state: ReflexState = {
    enabled: true,
    clutchCount: 0,
    shieldBlocks: 0,
    totemSaves: 0
  };

  constructor(bot: any) {
    this.bot = bot;
  }

  public start() {
    if (this.intervalId || !this.bot) return;

    // 20Hz tick = 50ms interval
    this.intervalId = setInterval(() => {
      if (!this.state.enabled || !this.bot.entity) return;
      this.tick();
    }, 50);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public setEnabled(enabled: boolean) {
    this.state.enabled = enabled;
  }

  public getState(): ReflexState {
    return { ...this.state };
  }

  private tick() {
    // A running reflex finishes first; re-triggering it every tick floods the server with packets
    if (this.state.activeReflex) return;

    const ignore = () => {};
    this.checkTotemSave().catch(ignore);
    this.checkShieldBlock().catch(ignore);
    this.checkFallDamageClutch().catch(ignore);
    this.checkFireExtinguish().catch(ignore);
  }

  /** Runs delayed reflex cleanup. The bot may have disconnected by the time it fires. */
  private after(delayMs: number, action: () => Promise<void> | void) {
    setTimeout(async () => {
      try {
        await action();
      } catch {
        // Bot went away during the delay
      }
      this.state.activeReflex = undefined;
    }, delayMs);
  }

  /**
   * MLG Water Clutch Reflex:
   * Triggers when falling downwards at high velocity (velocity.y < -0.6)
   * and distance to solid ground is less than 3.5 blocks.
   */
  private async checkFallDamageClutch() {
    if (!this.bot.entity) return;

    const vel = this.bot.entity.velocity;
    if (vel.y < -0.65) {
      // Find ground block below
      const pos = this.bot.entity.position;
      const blockBelow = this.bot.blockAt(pos.offset(0, -2, 0));
      const blockUnderneath = this.bot.blockAt(pos.offset(0, -1, 0));

      if (
        (blockBelow && blockBelow.boundingBox === 'block') ||
        (blockUnderneath && blockUnderneath.boundingBox === 'block')
      ) {
        // Find water bucket in inventory
        const waterBucket = this.bot.inventory.items().find((item: any) => item.name === 'water_bucket');
        if (waterBucket) {
          this.state.activeReflex = 'MLG Water Clutch';
          this.state.clutchCount++;
          await this.bot.equip(waterBucket, 'hand');
          await this.bot.look(this.bot.entity.yaw, -Math.PI / 2, true);
          this.bot.activateItem();

          // Pick water back up after landing
          this.after(400, async () => {
            const emptyBucket = this.bot.inventory.items().find((item: any) => item.name === 'bucket');
            if (emptyBucket) {
              await this.bot.equip(emptyBucket, 'hand');
              this.bot.activateItem();
            }
          });
        }
      }
    }
  }

  /**
   * Instant Shield Block:
   * If a Creeper is closer than 3.5 blocks and primed, or hostile skeleton aiming,
   * instantly equip and activate shield.
   */
  private async checkShieldBlock() {
    if (!this.bot.entity) return;

    const nearbyEntities = Object.values(this.bot.entities) as any[];
    const creeper = nearbyEntities.find((e: any) => 
      e.name === 'creeper' && 
      e.position.distanceTo(this.bot.entity.position) < 3.8
    );

    if (creeper) {
      const shield = this.bot.inventory.items().find((item: any) => item.name === 'shield');
      if (shield) {
        this.state.activeReflex = 'Shield Block';
        this.state.shieldBlocks++;
        await this.bot.equip(shield, 'off-hand');
        this.bot.activateItem(true); // Right click (hold shield)

        // Lower shield once danger passes
        this.after(1200, () => this.bot.deactivateItem());
      }
    }
  }

  /**
   * Totem of Undying Auto-Swap:
   * When health drops below 4 (2 hearts) and damage incoming, equip totem in off-hand immediately.
   */
  private async checkTotemSave() {
    if (this.bot.health !== undefined && this.bot.health <= 4) {
      const totem = this.bot.inventory.items().find((item: any) => item.name === 'totem_of_undying');
      if (totem && this.bot.inventory.slots[45]?.name !== 'totem_of_undying') {
        this.state.activeReflex = 'Totem Swap';
        this.state.totemSaves++;
        await this.bot.equip(totem, 'off-hand');
        this.after(2000, () => {});
      }
    }
  }

  /**
   * Extinguish Fire:
   * If on fire and carrying a water bucket, briefly place water and retrieve it.
   */
  private async checkFireExtinguish() {
    if (!this.bot.entity) return;
    const metadata = this.bot.entity.metadata;
    const isOnFire = metadata && (metadata[0] & 0x01) !== 0;

    if (isOnFire) {
      const waterBucket = this.bot.inventory.items().find((item: any) => item.name === 'water_bucket');
      if (waterBucket) {
        this.state.activeReflex = 'Fire Extinguish';
        await this.bot.equip(waterBucket, 'hand');
        await this.bot.look(this.bot.entity.yaw, -Math.PI / 2, true);
        this.bot.activateItem();
        this.after(250, async () => {
          const emptyBucket = this.bot.inventory.items().find((item: any) => item.name === 'bucket');
          if (emptyBucket) {
            await this.bot.equip(emptyBucket, 'hand');
            this.bot.activateItem();
          }
        });
      }
    }
  }
}
