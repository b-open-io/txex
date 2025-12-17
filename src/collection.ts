/**
 * Collection Support
 * Auto-detects collections and fetches all items
 */

const API_HOST = "https://ordinals.gorillapool.io/api";

export interface CollectionItem {
	outpoint: string;
	name?: string;
	mediaType?: string;
	size?: number;
}

export interface CollectionInfo {
	isCollection: boolean;
	name?: string;
	itemCount?: number;
}

interface InscriptionResponse {
	origin?: {
		data?: {
			map?: {
				type?: string;
				subType?: string;
				name?: string;
			};
		};
	};
}

interface CollectionItemResponse {
	outpoint: string;
	origin?: {
		outpoint: string;
		data?: {
			map?: {
				subTypeData?: {
					name?: string;
				};
			};
			insc?: {
				file?: {
					type?: string;
					size?: number;
				};
			};
		};
	};
}

/**
 * Check if an outpoint is a collection
 */
export async function checkIfCollection(
	outpoint: string,
): Promise<CollectionInfo> {
	try {
		const url = `${API_HOST}/inscriptions/${outpoint}`;
		const resp = await fetch(url);
		if (!resp.ok) {
			return { isCollection: false };
		}

		const data = (await resp.json()) as InscriptionResponse;
		const mapData = data?.origin?.data?.map;

		if (mapData?.type === "ord" && mapData?.subType === "collection") {
			return {
				isCollection: true,
				name: mapData.name,
			};
		}

		return { isCollection: false };
	} catch {
		return { isCollection: false };
	}
}

/**
 * Fetch all items from a collection
 */
export async function fetchCollectionItems(
	collectionId: string,
	options?: {
		limit?: number;
		onProgress?: (fetched: number) => void;
	},
): Promise<CollectionItem[]> {
	const limit = options?.limit ?? Number.POSITIVE_INFINITY;
	const items: CollectionItem[] = [];
	let offset = 0;
	const pageSize = 100;

	while (items.length < limit) {
		const q = JSON.stringify({
			map: {
				subTypeData: {
					collectionId,
				},
			},
		});
		const b64 = btoa(q);
		const url = `${API_HOST}/txos/search/unspent?offset=${offset}&limit=${pageSize}&q=${b64}`;

		const resp = await fetch(url);
		if (!resp.ok) {
			throw new Error(`Failed to fetch collection: ${resp.status}`);
		}

		const data = (await resp.json()) as CollectionItemResponse[];
		if (!data || data.length === 0) {
			break;
		}

		for (const item of data) {
			if (items.length >= limit) break;

			const origin = item.origin?.outpoint ?? item.outpoint;
			items.push({
				outpoint: origin,
				name: item.origin?.data?.map?.subTypeData?.name,
				mediaType: item.origin?.data?.insc?.file?.type,
				size: item.origin?.data?.insc?.file?.size,
			});
		}

		options?.onProgress?.(items.length);
		offset += pageSize;

		if (data.length < pageSize) {
			break;
		}
	}

	return items;
}
