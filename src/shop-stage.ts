import { Vector3 } from 'three';
import { state } from './state';

export const SHOP_FLOOR = 0.86;
export const smithPos = new Vector3(0, SHOP_FLOOR, -25.85);
export const shopRoninPos = new Vector3(-0.55, SHOP_FLOOR, -24.38);
export const shopCameraPos = new Vector3(0.80, SHOP_FLOOR + 1.40, -21.37);
export const shopFocus = new Vector3(-0.43, SHOP_FLOOR + 1.08, -25.02);
export const shopRoninFacing = Math.atan2(shopCameraPos.x - shopRoninPos.x, shopCameraPos.z - shopRoninPos.z);
export const shopStageActive = () => state.menu === 'shop' || (state.menu === 'custom' && state.indoors && state.playing);
